import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest, conflict } from '../lib/errors';
import { isGroupableItem, NO_SLOT, unitKind } from '../lib/finished-item';
import { fieldSourcesOf, toUnitView } from '../lib/product-fields';
import { MAX_COPIES, type MoveUnitsInput, type RepriceUnitsInput } from '../schemas/stock.schema';
import { findGroupFor, keepFoundQuantities, lockedListedFamily } from './stock.service';
import { absorbGroups } from './review.service';
import type { FieldChange, ItemView, UnitWriteResult } from '../../../shared/product';

// #471 (FEAT-98, decision points 12, 53 and 57; design.md "Détachement côté
// API"): move part of a group to another cellar, or change the price of part
// of it. The part taken keeps everything of its group but what changes —
// family, size, purchase day, estimated value, place of purchase — so the
// family's units, value and spending never move with a move; a new price
// changes the spending (and the value of copies without an estimated value),
// as asked.
//
// - All the copies: the group itself changes (a whole group moved leaves its
//   grid slot, a slot being a place in its old cellar's plan).
// - Part of them: the group keeps the rest, its slot (the slots of each copy
//   come with step 3, FEAT-93) and its sub-records.
// - Either way the copies taken complete the identical group of the family
//   (`findGroupFor`: D5 `groupKey`, the same estimated value, else the value
//   would change, never a group still to review, never without a purchase
//   day), if there is one, instead of making a line of their own.

/** A unit row as the extended client reads it (money columns as numbers). */
type UnitRecord = NonNullable<Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>>>;

/** What changes on the copies taken: their cellar, or their purchase price. */
type SplitChange = { field: 'cellarId'; to: string | null } | { field: 'purchasePrice'; to: number | null };

/** One line of the history the split writes (decision point 57): on which unit, what moved. */
export interface SplitEntry {
  itemId: string;
  changes: FieldChange[];
  /** The group the copies were taken from, when this entry is the one they went to. */
  fromItemId?: string;
  /** The line the copies went to, when this entry is the group they were taken from. */
  toItemId?: string;
}

export type SplitOutcome =
  | { conflict: true; item: ItemView }
  | {
      result: UnitWriteResult;
      productId: string;
      /** The copies moved or repriced. */
      count: number;
      /** The cellar or price before and after, for every history entry. */
      change: FieldChange;
      entries: SplitEntry[];
    };

/** Two cellars or prices (ids, numbers or empty) are the same. */
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A text field's value, null when empty. */
const given = (value: string | null) => (value != null && value.trim() !== '' ? value : null);

/**
 * The group `target` once completed to `quantity` copies by copies of
 * `group`: nothing of them is lost — what the target leaves empty (place
 * of purchase, location), the group fills; locks and field sources are
 * united, the target's first (as the review merge, J1).
 */
function completion(target: UnitRecord, group: UnitRecord, quantity: number) {
  const sources = { ...fieldSourcesOf(group.fieldSources), ...fieldSourcesOf(target.fieldSources) };
  return {
    quantity,
    purchasePlace: given(target.purchasePlace) ?? given(group.purchasePlace),
    location: given(target.location) ?? given(group.location),
    lockedFields: [...new Set([...target.lockedFields, ...group.lockedFields])].sort(),
    fieldSources: Object.keys(sources).length > 0 ? (sources as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

/** The columns `change` writes. */
const changeData = (change: SplitChange) =>
  change.field === 'cellarId' ? { cellarId: change.to } : { purchasePrice: change.to };

/**
 * The new line of `count` copies taken from `origin`, `change` applied:
 * everything of the group but its slot, its sub-records (they stay on it)
 * and its guessed number (`needsReview`: the member just said how many).
 * Without a purchase day, the line keeps the group's creation date, which
 * then dates its spending (budget: `purchasedAt ?? createdAt`).
 */
function splitLineOf(origin: UnitRecord, userId: string, count: number, change: SplitChange): Prisma.InventoryItemUncheckedCreateInput {
  const {
    id: _id, createdAt, updatedAt: _updatedAt, updatedBy: _updatedBy, userId: _creator, fieldSources, ...copied
  } = origin;
  return {
    ...copied,
    fieldSources: fieldSources === null ? Prisma.DbNull : (fieldSources as Prisma.InputJsonValue),
    ...(origin.purchasedAt === null ? { createdAt } : {}),
    id: uuidv4(),
    userId,
    ...changeData(change),
    quantity: count,
    ...NO_SLOT,
    parentItemId: null,
    needsReview: false,
  };
}

async function sharesAnInventorySession(tx: PrismaClientOrTx, a: string, b: string): Promise<boolean> {
  const entries = await tx.inventoryCountEntry.findMany({ where: { itemId: { in: [a, b] } }, select: { itemId: true, sessionId: true } });
  const sessionsOf = (id: string) => new Set(entries.filter((entry) => entry.itemId === id).map((entry) => entry.sessionId));
  const ofB = sessionsOf(b);
  return [...sessionsOf(a)].some((session) => ofB.has(session));
}

/** The fields of a unit that tell its group apart (D5 `groupKey`, the family aside). */
export const GROUP_KEY_FIELDS = ['cellarId', 'purchasePrice', 'purchasedAt', 'bottleSize', 'cigarsPerBox'] as const;

/**
 * #471 (W3 review, design.md rule 4): a whole group whose own values were
 * just edited ("Modifier", a restored value) so that it is now identical to
 * another group of its family joins it — the older one stays, takes its
 * copies and everything hanging on it, the edited one is gone. Not for a
 * group still to review (`needsReview`), for two groups each in a slot (one
 * slot, one unit), for two groups counted in one inventory session, nor
 * beyond {@link MAX_COPIES}. Run in the transaction holding the family's
 * lock, after the write. Null when nothing joined.
 */
export async function joinIdenticalGroup(
  tx: PrismaClientOrTx,
  group: UnitRecord,
  kind: ReturnType<typeof unitKind>,
  userId: string,
): Promise<{ survivorId: string; from: number; to: number } | null> {
  if (!isGroupableItem(group) || !group.isOwned || group.needsReview) return null;
  const target = await findGroupFor(tx, group, kind, { excludeId: group.id, estimatedValue: group.estimatedValue, settledOnly: true });
  if (!target) return null;
  const from = target.quantity ?? 1;
  const to = from + (group.quantity ?? 1);
  if (to > MAX_COPIES) return null;
  if (group.slotColumn !== null && target.slotColumn !== null) return null;
  if (await sharesAnInventorySession(tx, group.id, target.id)) return null;
  await keepFoundQuantities(tx, [target.id, group.id]);
  // The edited group's slot goes to the survivor that has none (deleted first: one slot, one unit).
  const keepsSlot = target.slotColumn === null && group.slotColumn !== null
    ? { slotColumn: group.slotColumn, slotRow: group.slotRow } : {};
  await absorbGroups(tx, target.id, [group.id]);
  await tx.inventoryItem.update({
    where: { id: target.id },
    data: { ...completion(target, group, to), ...keepsSlot, updatedBy: userId },
  });
  return { survivorId: target.id, from, to };
}

/**
 * Takes `count` copies of the group `groupId` and applies `change` to them,
 * in one transaction: the family is locked first (the locking rule), then
 * the group is read and `expectedUpdatedAt` checked under that lock. Null
 * when the unit is unknown or in the trash; 409 PRODUCT_IN_TRASH when its
 * family is, and NOT_A_GROUP (as A2) for a unit that is not an intact
 * group in stock; 400 for a count beyond the group, or a change that
 * changes nothing.
 */
async function splitUnits(
  userId: string,
  groupId: string,
  count: number,
  expectedUpdatedAt: string | undefined,
  change: SplitChange,
): Promise<SplitOutcome | null> {
  const head = await prisma.inventoryItem.findFirst({ where: { id: groupId, deletedAt: null }, select: { productId: true } });
  if (!head) return null;

  return prisma.$transaction(async (tx): Promise<SplitOutcome | null> => {
    const product = await lockedListedFamily(tx, head.productId);
    const group = await tx.inventoryItem.findFirst({ where: { id: groupId, deletedAt: null } });
    if (!group) return null;
    const stale = expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== group.updatedAt.getTime();
    // Moved to another family meanwhile (a merge): its lock was not the one taken.
    if (stale || group.productId !== head.productId) return { conflict: true, item: toUnitView(group) };
    if (!isGroupableItem(group) || !group.isOwned) throw conflict('NOT_A_GROUP');

    const from = group.quantity ?? 1;
    if (count > from) throw badRequest('COUNT_ABOVE_GROUP');
    const before = group[change.field];
    if (sameValue(before, change.to)) throw badRequest(change.field === 'cellarId' ? 'SAME_CELLAR' : 'SAME_PRICE');
    if (change.field === 'cellarId' && change.to !== null
      && !(await tx.cellar.findUnique({ where: { id: change.to }, select: { id: true } }))) {
      throw badRequest('CELLAR_NOT_FOUND');
    }

    const kind = unitKind(product.category);
    const moved: FieldChange = { field: change.field, from: before, to: change.to };
    const done = (result: UnitWriteResult, entries: SplitEntry[]): SplitOutcome =>
      ({ result, productId: group.productId, count, change: moved, entries });
    const stamp = { updatedBy: userId };
    let target = await findGroupFor(tx, { ...group, ...changeData(change) }, kind, {
      excludeId: group.id, estimatedValue: group.estimatedValue, settledOnly: true,
    });
    if (target && count === from) {
      // Two groups counted in the same inventory session keep their entries
      // apart (one per unit); a new price for a group and the identical
      // group both in a slot would lose one slot. The whole group then
      // simply changes, next to the other.
      const twoSlots = change.field === 'purchasePrice' && group.slotColumn !== null && target.slotColumn !== null;
      if (twoSlots || await sharesAnInventorySession(tx, group.id, target.id)) target = null;
    }
    if (target && (target.quantity ?? 1) + count > MAX_COPIES) throw badRequest('QUANTITY_TOO_LARGE');

    if (count === from) {
      if (!target) {
        // A whole group moved leaves its slot: a place in its old cellar's plan.
        const leaves = change.field === 'cellarId' && group.slotColumn !== null ? NO_SLOT : {};
        const changed = await tx.inventoryItem.update({ where: { id: group.id }, data: { ...changeData(change), ...leaves, ...stamp } });
        const slotChanges = Object.keys(leaves).map((field) => ({ field, from: group[field as keyof typeof NO_SLOT], to: null }));
        return done({ data: toUnitView(changed), changed: [], removedIds: [] }, [{ itemId: group.id, changes: [moved, ...slotChanges] }]);
      }
      // The whole group completes the identical one: it takes its copies and
      // everything hanging on it, the group is gone.
      const to = (target.quantity ?? 1) + count;
      await keepFoundQuantities(tx, [group.id, target.id]);
      await absorbGroups(tx, target.id, [group.id]);
      // A new price in the same cellar: the copies stay where they were, so
      // the group's slot goes to the line that has none (deleted first: one slot, one unit).
      const keepsSlot = change.field === 'purchasePrice' && group.slotColumn !== null
        ? { slotColumn: group.slotColumn, slotRow: group.slotRow } : {};
      const completed = await tx.inventoryItem.update({
        where: { id: target.id },
        data: {
          ...completion(target, group, to),
          needsReview: target.needsReview || group.needsReview,
          ...keepsSlot,
          ...stamp,
        },
      });
      return done(
        { data: toUnitView(completed), changed: [], removedIds: [group.id] },
        [{ itemId: target.id, fromItemId: group.id, changes: [{ field: 'quantity', from: target.quantity ?? 1, to }, moved] }],
      );
    }

    // Part of the group: it keeps the rest; the copies taken complete the
    // identical group, or make a new line.
    const rest = await tx.inventoryItem.update({ where: { id: group.id }, data: { quantity: from - count, ...stamp } });
    if (target) await keepFoundQuantities(tx, [target.id]);
    const line = target
      ? await tx.inventoryItem.update({ where: { id: target.id }, data: { ...completion(target, group, (target.quantity ?? 1) + count), ...stamp } })
      : await tx.inventoryItem.create({ data: splitLineOf(group, userId, count, change) });
    const lineFrom = target ? target.quantity ?? 1 : null;
    return done({ data: toUnitView(line), changed: [toUnitView(rest)], removedIds: [] }, [
      { itemId: group.id, toItemId: line.id, changes: [{ field: 'quantity', from, to: from - count }] },
      { itemId: line.id, fromItemId: group.id, changes: [{ field: 'quantity', from: lineFrom, to: lineFrom === null ? count : lineFrom + count }, moved] },
    ]);
  });
}

export const stockSplitService = {
  /**
   * FEAT-98 c1-c4, point 12: "Déplacer" `count` copies of a group to
   * another cellar (null: no cellar). The family's units, value and spending
   * do not change; each cellar's count follows.
   */
  moveUnits(userId: string, groupId: string, input: MoveUnitsInput): Promise<SplitOutcome | null> {
    return splitUnits(userId, groupId, input.count, input.expectedUpdatedAt, { field: 'cellarId', to: input.cellarId });
  },

  /**
   * FEAT-98 c5, point 53: "Changer le prix" of `count` copies of a group (the
   * price of one copy; null: no price). The units do not change; the
   * spending follows the new price, and so does the value of copies without
   * an estimated value.
   */
  repriceUnits(userId: string, groupId: string, input: RepriceUnitsInput): Promise<SplitOutcome | null> {
    return splitUnits(userId, groupId, input.count, input.expectedUpdatedAt, { field: 'purchasePrice', to: input.purchasePrice });
  },
};

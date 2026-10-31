import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { groupKey, isGroupableItem, NO_SLOT, unitKind, type UnitKind } from '../lib/finished-item';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { toUnitView } from '../lib/product-fields';
import { MAX_COPIES, type MoveUnitsInput, type RepriceUnitsInput } from '../schemas/stock.schema';
import { lockedListedFamily } from './stock.service';
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
//   (D5 `groupKey`, and the same estimated value, else the value would
//   change), if there is one, instead of making a line of their own.

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

/** Two cellars, prices or estimated values (numbers, ids or empty) are the same. */
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The columns `change` writes. */
const changeData = (change: SplitChange) =>
  change.field === 'cellarId' ? { cellarId: change.to } : { purchasePrice: change.to };

/**
 * The group of the family that the copies taken from `origin` join once
 * `change` is applied: intact, in stock, same `groupKey` (D5) and the same
 * estimated value; the oldest one should two of them coexist. Null when
 * there is none — the copies then make a line of their own.
 */
async function identicalGroup(tx: PrismaClientOrTx, origin: UnitRecord, change: SplitChange, kind: UnitKind): Promise<UnitRecord | null> {
  const target = { ...origin, ...changeData(change) };
  const key = groupKey(target, kind);
  const candidates = await tx.inventoryItem.findMany({
    where: { productId: origin.productId, id: { not: origin.id }, deletedAt: null, writtenOffAt: null, ...OWNED_ITEM_FILTER },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return candidates.find((unit) => isGroupableItem(unit) && groupKey(unit, kind) === key
    && sameValue(unit.estimatedValue, origin.estimatedValue)) ?? null;
}

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

/**
 * Takes `count` copies of the group `groupId` and applies `change` to them,
 * in one transaction: the family is locked first (the locking rule), then
 * the group is read and `expectedUpdatedAt` checked under that lock. Null
 * when the unit is unknown or in the trash; 409 PRODUCT_IN_TRASH when its
 * family is; 400 for a unit that is not an intact group in stock, a count
 * beyond the group, or a change that changes nothing.
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
    if (!isGroupableItem(group) || !group.isOwned) throw badRequest('NOT_A_GROUP');

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
    let target = await identicalGroup(tx, group, change, kind);
    // Two groups counted in the same inventory session keep their entries
    // apart (one per unit): a whole group then simply changes, next to the other.
    if (target && count === from && await sharesAnInventorySession(tx, group.id, target.id)) target = null;
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
      // D15: an entry keeps the number it found in the group it counted.
      await tx.$executeRaw`UPDATE "inventory_count_entries" AS e SET "foundQuantity" = coalesce(e."foundQuantity", b."quantity")
        FROM "bottles" AS b WHERE b."id" = e."itemId" AND e."itemId" IN (${Prisma.join([group.id, target.id])})`;
      await absorbGroups(tx, target.id, [group.id]);
      // A new price in the same cellar: the copies stay where they were, so
      // the group's slot goes to the line that has none (deleted first: one slot, one unit).
      const keepsSlot = change.field === 'purchasePrice' && group.slotColumn !== null && target.slotColumn === null
        ? { slotColumn: group.slotColumn, slotRow: group.slotRow } : {};
      const completed = await tx.inventoryItem.update({
        where: { id: target.id },
        data: { quantity: to, needsReview: target.needsReview || group.needsReview, ...keepsSlot, ...stamp },
      });
      return done(
        { data: toUnitView(completed), changed: [], removedIds: [group.id] },
        [{ itemId: target.id, fromItemId: group.id, changes: [{ field: 'quantity', from: target.quantity ?? 1, to }, moved] }],
      );
    }

    // Part of the group: it keeps the rest; the copies taken complete the
    // identical group, or make a new line.
    const rest = await tx.inventoryItem.update({ where: { id: group.id }, data: { quantity: from - count, ...stamp } });
    const line = target
      ? await tx.inventoryItem.update({ where: { id: target.id }, data: { quantity: (target.quantity ?? 1) + count, ...stamp } })
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

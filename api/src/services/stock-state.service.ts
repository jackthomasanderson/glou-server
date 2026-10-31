import type { InventoryItem, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type { PrismaClientOrTx } from '../lib/prisma';
import { AppError } from '../lib/errors';
import {
  FINISHED_ITEM_STATE, NO_SLOT, groupKey, isFinishedState, isGroupableItem, isIntactItem, unitKind, type UnitKind,
} from '../lib/finished-item';
import { lockFamily, mirrorFamilyOnto } from '../lib/product-fields';
import { TASTINGS_ON_ITEM } from '../../../shared/product';

// #471 (FEAT-103/106, design.md "Détacher / Rattacher", "Détachement côté
// API"): the one place where an individual state is written on a unit.
//
// - Detach: an individual state (opened, a level, finished, a smoked cigar)
//   written on a group of more than one takes one copy off the group and
//   puts the state on a new sub-record (`parentItemId` = the group), in the
//   same transaction. The grid slot stays with the group. A group of one
//   takes the state itself.
// - Reattach: a sub-record put back intact (closed and full) goes back into
//   its group of origin if that group still exists, out of the trash, and is
//   still the same group (`groupKey`, D5); otherwise it becomes a group of
//   one of the family (`parentItemId` cleared). A tasting noted on a
//   sub-record about to disappear is not dropped silently: 409
//   TASTINGS_ON_ITEM until the caller says whether to keep it (on the family)
//   or not.
//
// The total of copies bought and the spending never change: a detach moves a
// copy from the group to the sub-record, a reattach moves it back.
//
// Every caller holds the family lock (`lockFamily`) before calling — the
// locking rule of the families work: families first, in sorted order, then
// units — and passes the unit as read once that lock is held.

/** The state columns of a unit: what makes it a group (intact) or a sub-record. */
export const STATE_FIELDS = ['isOpened', 'fillLevel', 'openedAt', 'cigarsLeft'] as const;
export type StateField = (typeof STATE_FIELDS)[number];

const STATE_FIELD_SET: ReadonlySet<string> = new Set(STATE_FIELDS);
export const isStateField = (field: string): field is StateField => STATE_FIELD_SET.has(field);

/** A unit row as read in the transaction (no relation; money as numbers, lib/prisma.ts). */
export type StateItem = Omit<InventoryItem, 'purchasePrice' | 'estimatedValue'> & {
  purchasePrice: number | null;
  estimatedValue: number | null;
};

export interface StatePatch {
  isOpened?: boolean;
  fillLevel?: number | null;
  openedAt?: Date | null;
  cigarsLeft?: number | null;
}

export interface StateWrite {
  /** The unit's other columns from the patch (cellar, price, quantity, slot…): written on the group or on the unit itself. */
  unit?: Record<string, unknown>;
  /** The state columns from the patch. */
  state?: StatePatch;
  /** Smoke one cigar: the first of a closed box opens it (M−1 left), a single cigar is finished. */
  smokeOne?: boolean;
  /** For a reattach that would remove a sub-record holding tastings: keep them on the family (true) or delete them (false). */
  keepTastings?: boolean;
}

export type StateOutcome = 'updated' | 'detached' | 'reattached' | 'regrouped';

export interface StatePlan {
  outcome: StateOutcome;
  /** Every column of the unit once the patch is applied (the sub-record's columns for a detach). */
  next: StateItem;
}

export interface ApplyStateResult<R> {
  outcome: StateOutcome;
  /** The state written on the unit carrying it. */
  state: Pick<StateItem, StateField>;
  /** The unit gave its grid slot back (it is finished). */
  releasedSlot: boolean;
  /** The unit that now carries the requested state: the sub-record, the unit itself, or the group that absorbed it. */
  data: R;
  /** The other units written (the group a copy was taken from). */
  changed: R[];
  /** The units deleted (a sub-record absorbed by its group). */
  removedIds: string[];
  /** The group whose count this write moved (−1 on a detach, +1 on a reattach), for its history. */
  groupChange?: { itemId: string; from: number; to: number };
  /** Tastings deleted by a reattach answered `keepTastings: false`, for the history. */
  deletedTastings?: number;
}

const stateError = (status: number, code: string, details?: unknown) => new AppError(status, code, { details });

const hasSlot = (item: Pick<StateItem, 'slotColumn' | 'slotRow'>) => item.slotColumn != null && item.slotRow != null;

/**
 * The unit once `write` is applied, and what that means — pure, so every
 * rule is tested without a database. Throws an AppError for a write that
 * cannot be applied (smoking something that is not a cigar, or nothing).
 */
export function planState(item: StateItem, write: StateWrite, kind: UnitKind, now: Date = new Date()): StatePlan {
  const given = Object.fromEntries(Object.entries(write.state ?? {}).filter(([, value]) => value !== undefined)) as StatePatch;
  const next = { ...item, ...(write.unit ?? {}), ...given } as StateItem;

  if (write.smokeOne) {
    if (kind !== 'cigar') throw stateError(400, 'NOT_A_CIGAR');
    if (item.writtenOffAt != null || isFinishedState(item)) throw stateError(409, 'NOTHING_LEFT_TO_SMOKE');
    let left: number;
    if (item.isOpened) {
      left = (item.cigarsLeft ?? 1) - 1;
    } else {
      left = item.cigarsPerBox != null ? item.cigarsPerBox - 1 : 0;
      next.isOpened = true;
      next.openedAt = given.openedAt ?? now;
    }
    next.cigarsLeft = left;
    if (left <= 0) Object.assign(next, FINISHED_ITEM_STATE);
  }

  if (kind === 'cigar') normalizeCigarState(item, next, given);
  if (!item.isOpened && next.isOpened && next.openedAt == null && kind === 'cigar') next.openedAt = now;

  // A closed full unit carries no opening date any more.
  if (isIntactItem(next) && !isIntactItem(item) && given.openedAt === undefined) next.openedAt = null;

  const quantity = next.quantity ?? 1;
  const intact = isIntactItem(next);
  let outcome: StateOutcome = 'updated';
  if (isGroupableItem(item) && !intact && quantity > 1) {
    outcome = 'detached';
  } else if (!isIntactItem(item) && item.writtenOffAt == null && intact) {
    outcome = item.parentItemId ? 'reattached' : 'regrouped';
  } else if (!intact && quantity !== 1) {
    // A sub-record is always one copy: only an intact group (or a write-off)
    // counts more, and a count of 0 would erase it from the spending (a
    // correction goes through "Corriger le nombre", A2).
    throw stateError(400, 'INDIVIDUAL_STATE_ON_GROUP');
  }

  // A finished unit gives its grid slot back (#573) — a detached one has none.
  if (isFinishedState(next) && outcome !== 'detached') Object.assign(next, NO_SLOT);
  return { outcome, next };
}

/**
 * Cigars: an opened box knows how many cigars it has left. Opening a box
 * without saying so leaves it full; 0 left is a finished box; a box closed
 * again with every cigar is a closed box (no count).
 */
function normalizeCigarState(item: StateItem, next: StateItem, given: StatePatch): void {
  if (next.cigarsPerBox == null) {
    // An opened box keeps its size: without it, its count means nothing.
    if (item.cigarsPerBox != null && !isIntactItem(item)) throw stateError(400, 'BOX_SIZE_REQUIRED');
    // Single cigars: no box to count in.
    next.cigarsLeft = null;
    return;
  }
  if (next.cigarsLeft != null && next.cigarsLeft > next.cigarsPerBox) throw stateError(400, 'CIGARS_LEFT_ABOVE_BOX');
  if (next.isOpened && !item.isOpened && next.cigarsLeft == null) next.cigarsLeft = next.cigarsPerBox;
  if (item.isOpened && !next.isOpened) {
    // Closing an opened box again (a mistaken opening) puts it back complete
    // — only if it is: a box with cigars smoked out of it cannot be closed,
    // and is refused rather than silently refilled (the guest's "opened"
    // switch sends exactly that; the smoked cigars would vanish from the
    // stock history). Putting back a box finished by mistake says so:
    // `cigarsLeft` = the size of the box.
    const left = given.cigarsLeft === undefined ? item.cigarsLeft : given.cigarsLeft;
    const complete = left === next.cigarsPerBox || (left == null && item.cigarsLeft == null);
    if (!complete) throw stateError(400, 'BOX_NOT_COMPLETE');
    next.cigarsLeft = null;
    if (given.fillLevel === undefined) next.fillLevel = null;
  }
  // A count of cigars left that is not a full box is an opened box.
  if (!next.isOpened && next.cigarsLeft != null && next.cigarsLeft !== next.cigarsPerBox) next.isOpened = true;
  if (next.isOpened && next.cigarsLeft === 0) Object.assign(next, FINISHED_ITEM_STATE);
  if (isFinishedState(next)) next.cigarsLeft = 0;
  if (!next.isOpened && next.cigarsLeft === next.cigarsPerBox) next.cigarsLeft = null;
}

/** The columns a detached sub-record does not inherit from its group. */
const NOT_INHERITED = new Set(['id', 'createdAt', 'updatedAt', 'product', 'cellar', 'user']);

/** Prisma refuses a bare `null` for a Json column. */
function writable(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([field, value]) => !(field === 'fieldSources' && value === null)));
}

/**
 * Applies `write` to `item` with the detach / reattach rules. `item` is the
 * unit as read in `tx` once its family is locked. `include` is what the
 * returned rows carry (the caller's view). The changed columns are stamped
 * with `updatedBy` and a new `updatedAt`, so a replayed offline write is
 * stopped by `expectedUpdatedAt`.
 */
export async function applyState<I extends Prisma.InventoryItemInclude, R>(
  tx: PrismaClientOrTx,
  item: StateItem,
  write: StateWrite,
  context: { userId: string; kind: UnitKind; include: I; now?: Date },
): Promise<ApplyStateResult<R>> {
  const now = context.now ?? new Date();
  const { include, userId } = context;
  const stamp = { updatedAt: now, updatedBy: userId };
  const { outcome, next } = planState(item, write, context.kind, now);
  const state = Object.fromEntries(STATE_FIELDS.map((field) => [field, next[field]])) as Pick<StateItem, StateField>;
  const releasedSlot = outcome !== 'detached' && isFinishedState(next) && hasSlot(item);
  const done = { state, releasedSlot };
  const own = (row: StateItem) => Object.fromEntries(
    Object.entries(row).filter(([field]) => !NOT_INHERITED.has(field)),
  );

  if (outcome === 'detached') {
    const { quantity: _q, ...unit } = Object.fromEntries(
      Object.entries(write.unit ?? {}).filter(([field]) => !isStateField(field)),
    );
    const group = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { ...unit, quantity: (next.quantity ?? 1) - 1, ...stamp } as never,
      include,
    });
    const subId = uuidv4();
    const sub = {
      ...own(next),
      id: subId,
      userId,
      updatedBy: userId,
      quantity: 1,
      parentItemId: item.id,
      needsReview: false,
      writtenOffAt: null,
      ...NO_SLOT,
    };
    await tx.inventoryItem.create({ data: writable(sub) as never });
    // The description columns of the new row come from its family (the transitional mirror).
    await mirrorFamilyOnto(tx, subId);
    const created = await tx.inventoryItem.findUniqueOrThrow({ where: { id: subId }, include });
    const from = next.quantity ?? 1;
    return {
      outcome, ...done, data: created as R, changed: [group as R], removedIds: [],
      groupChange: { itemId: item.id, from, to: from - 1 },
    };
  }

  if (outcome === 'reattached') {
    const parent = await tx.inventoryItem.findFirst({ where: { id: item.parentItemId!, deletedAt: null, writtenOffAt: null } });
    const fits = parent != null
      && parent.productId === item.productId
      && isGroupableItem(parent)
      && groupKey(parent, context.kind) === groupKey(next, context.kind)
      && !(hasSlot(next) && hasSlot(parent));
    if (fits) return { ...(await absorb<I, R>(tx, item, next, parent, write.keepTastings, { include, stamp })), ...done };
    const regrouped = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { ...writable(changedColumns(item, next)), parentItemId: null, ...stamp } as never,
      include,
    });
    return { outcome: 'regrouped', ...done, data: regrouped as R, changed: [], removedIds: [] };
  }

  const updated = await tx.inventoryItem.update({
    where: { id: item.id },
    data: { ...writable(changedColumns(item, next)), ...(outcome === 'regrouped' ? { parentItemId: null } : {}), ...stamp } as never,
    include,
  });
  return { outcome, ...done, data: updated as R, changed: [], removedIds: [] };
}

/** Written by the service itself (locks, sources), not fields a member asked to change. */
const REATTACH_BOOKKEEPING = new Set(['lockedFields', 'fieldSources', 'updatedBy']);

/** The columns of `next` that differ from `item`: only what really changes is written. */
function changedColumns(item: StateItem, next: StateItem): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(next).filter(([field, value]) =>
      !NOT_INHERITED.has(field) && JSON.stringify((item as Record<string, unknown>)[field]) !== JSON.stringify(value)),
  );
}

/**
 * The sub-record goes back into its group: one more copy there, the
 * sub-record deleted. What pointed at it follows the group — its history,
 * its rotating-inventory entries, a wishlist conversion — and its tastings
 * stay on the family when kept.
 */
async function absorb<I extends Prisma.InventoryItemInclude, R>(
  tx: PrismaClientOrTx,
  item: StateItem,
  next: StateItem,
  parent: StateItem,
  keepTastings: boolean | undefined,
  { include, stamp }: { include: I; stamp: { updatedAt: Date; updatedBy: string } },
): Promise<Omit<ApplyStateResult<R>, 'state' | 'releasedSlot'>> {
  // The sub-record disappears: another field written with it would be lost.
  // Refused rather than applied to the whole group (one bottle's location or
  // value is not every bottle's).
  const others = Object.keys(changedColumns(item, next)).filter((field) => !isStateField(field) && !REATTACH_BOOKKEEPING.has(field));
  if (others.length > 0) throw stateError(400, 'FIELDS_WITH_REATTACH', { fields: others });
  const tastings = await tx.tastingNote.count({ where: { itemId: item.id } });
  if (tastings > 0 && keepTastings === undefined) throw stateError(409, TASTINGS_ON_ITEM, { count: tastings });
  if (tastings > 0 && keepTastings) {
    await tx.tastingNote.updateMany({ where: { itemId: item.id }, data: { itemId: null, productId: item.productId } });
  } else if (tastings > 0) {
    await tx.tastingNote.deleteMany({ where: { itemId: item.id } });
  }

  await tx.auditLog.updateMany({ where: { bottleId: item.id }, data: { bottleId: parent.id } });
  await tx.wishlistItem.updateMany({ where: { acquiredItemId: item.id }, data: { acquiredItemId: parent.id } });
  await tx.inventoryItem.updateMany({ where: { parentItemId: item.id }, data: { parentItemId: parent.id } });
  // One entry per unit and session: an entry of the sub-record moves to the
  // group unless the group is counted in that session already (the
  // sub-record's entry then goes with it, cascade).
  const entries = await tx.inventoryCountEntry.findMany({ where: { itemId: item.id }, select: { id: true, sessionId: true } });
  for (const entry of entries) {
    const taken = await tx.inventoryCountEntry.findFirst({ where: { sessionId: entry.sessionId, itemId: parent.id }, select: { id: true } });
    if (!taken) await tx.inventoryCountEntry.update({ where: { id: entry.id }, data: { itemId: parent.id } });
  }

  // Deleted first: its grid slot, if any, then goes to the group (which has none).
  await tx.inventoryItem.delete({ where: { id: item.id } });
  const group = await tx.inventoryItem.update({
    where: { id: parent.id },
    data: {
      quantity: (parent.quantity ?? 1) + (next.quantity ?? 1),
      ...(hasSlot(next) ? { slotColumn: next.slotColumn, slotRow: next.slotRow } : {}),
      ...stamp,
    } as never,
    include,
  });
  const from = parent.quantity ?? 1;
  return {
    outcome: 'reattached', data: group as R, changed: [], removedIds: [item.id],
    groupChange: { itemId: parent.id, from, to: from + (next.quantity ?? 1) },
    ...(tastings > 0 && !keepTastings ? { deletedTastings: tastings } : {}),
  };
}

/**
 * Marks `count` copies of a unit as finished (drunk, smoked), each one
 * through the detach rule: a group of six with three missing leaves a group
 * of three and three finished bottles. Locks the family itself (an entry
 * point of its own: rotating inventory, consumption). Returns the ids of
 * the finished units.
 */
export async function finishUnits(
  tx: PrismaClientOrTx,
  itemId: string,
  count: number,
  context: { userId: string; now?: Date },
): Promise<string[]> {
  const first = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { productId: true } });
  if (!first) return [];
  await lockFamily(tx, first.productId);
  const finished: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, include: { product: { select: { category: true } } } });
    if (!item || item.writtenOffAt != null || isFinishedState(item)) break;
    const { product, ...row } = item;
    const result = await applyState<{ product: { select: { category: true } } }, { id: string }>(
      tx, row as StateItem, { state: { ...FINISHED_ITEM_STATE } },
      { userId: context.userId, kind: unitKind(product.category), include: { product: { select: { category: true } } }, now: context.now },
    );
    finished.push(result.data.id);
  }
  return finished;
}

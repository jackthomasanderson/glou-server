import type { InventoryItem, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type { PrismaClientOrTx } from '../lib/prisma';
import { AppError } from '../lib/errors';
import {
  FINISHED_ITEM_STATE, groupKey, isFinishedState, isGroupableItem, isIntactItem, unitKind, type UnitKind,
} from '../lib/finished-item';
import {
  fitSlotsTo, freeSlots, liveSlotsOf, moveSlots, pickSlots, slotChoiceError, slotsFreed, slotsPlaced,
  type SlotChange, type SlotChoice, type SlotRow,
} from '../lib/slots';
import { SLOT_CHANGED, SLOT_CHOICE_REQUIRED } from '../../../shared/product';
import { slotCapacity } from '../../../shared/units';
import { lockFamily } from '../lib/product-fields';
import { followDetach, moveCountEntry } from '../lib/count-entries';
import { moveHistoryOnto } from '../lib/audit-history';
import { TASTINGS_ON_ITEM } from '../../../shared/product';

// #471 (FEAT-103/106, design.md "Détacher / Rattacher", "Détachement côté
// API"): the one place where an individual state is written on a unit.
//
// - Detach: an individual state (opened, a level, finished, a smoked cigar)
//   written on a group of more than one takes one copy off the group and
//   puts the state on a new sub-record (`parentItemId` = the group), in the
//   same transaction. A group of one takes the state itself.
// - Slots (FEAT-93): the copy taken off a group holding cells comes from
//   the cell the member chose (`fromSlotId`) or from an unplaced copy
//   (`fromUnplaced`) — a member's write without a choice is refused, 409
//   SLOT_CHOICE_REQUIRED; gestures made without the plan in sight take an
//   unplaced copy first, else the cell placed most recently (decision #471
//   point 75, `'auto'`). The opened sub-record takes that cell, a finished
//   one frees it. A group of single cigars keeps its one cell until its last
//   cigar: never a question there. A line of one is the copy itself: opened
//   it keeps its cell, finished it frees it. A unit finished or written off
//   frees its cells; a unit changing cellar frees them first (they mean
//   nothing in the other cellar). A cell chosen that is no longer the
//   line's, or an unplaced copy chosen when none is left: 409 SLOT_CHANGED.
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
  /**
   * FEAT-93: what happened to the cells of the unit answered (`data`), for its
   * history: cells freed, or the cell an opened copy took from its group.
   */
  slotChanges: SlotChange[];
  /** The unit that now carries the requested state: the sub-record, the unit itself, or the group that absorbed it. */
  data: R;
  /** The other units written (the group a copy was taken from). */
  changed: R[];
  /** The units deleted (a sub-record absorbed by its group). */
  removedIds: string[];
  /** The group whose count this write moved (−1 on a detach, +1 on a reattach), for its history. */
  groupChange?: {
    itemId: string; from: number; to: number;
    /** FEAT-93: the cells the group gave up on a detach (freed, or taken by the opened copy), for its history. */
    slotChanges?: SlotChange[];
  };
  /** Tastings deleted by a reattach answered `keepTastings: false`, for the history. */
  deletedTastings?: number;
}

const stateError = (status: number, code: string, details?: unknown) => new AppError(status, code, { details });

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
  context: {
    userId: string; kind: UnitKind; include: I; now?: Date;
    /** Which copy leaves a group holding cells (FEAT-93); the automatic rule when absent. */
    slotChoice?: SlotChoice;
  },
): Promise<ApplyStateResult<R>> {
  const now = context.now ?? new Date();
  const { include, userId } = context;
  const choice = context.slotChoice ?? 'auto';
  const stamp = { updatedAt: now, updatedBy: userId };
  const { outcome, next } = planState(item, write, context.kind, now);
  const state = Object.fromEntries(STATE_FIELDS.map((field) => [field, next[field]])) as Pick<StateItem, StateField>;
  const slotChanges: SlotChange[] = [];
  const done = { state, slotChanges };
  // The cell or the unplaced copy chosen must still be the line's (a choice
  // made on a plan, or queued offline, before someone else changed it).
  const single = context.kind === 'cigar' && item.cigarsPerBox == null;
  const chosen = choice === 'auto' || choice === 'ask' ? null : choice;
  const lineSlots = chosen ? await liveSlotsOf(tx, item.id) : null;
  if (chosen && lineSlots) {
    const copies = item.quantity ?? 1;
    const stale = 'fromSlotId' in chosen
      ? !lineSlots.some((slot) => slot.id === chosen.fromSlotId)
      : !single && lineSlots.length >= copies;
    if (stale) throw slotChoiceError(SLOT_CHANGED, lineSlots, (single ? 1 : copies) - lineSlots.length);
  }
  // The composite key keeps a slot in its unit's cellar: a unit changing
  // cellar gives its cells back before the cellar is written (#798).
  // The cells read for the choice are then gone: the copy leaves no cell
  // behind (the history says each cell freed once, by the cellar change).
  const changesCellar = next.cellarId !== item.cellarId;
  if (changesCellar) slotChanges.push(...slotsFreed(await freeSlots(tx, item.id)));
  const own = (row: StateItem) => Object.fromEntries(
    Object.entries(row).filter(([field]) => !NOT_INHERITED.has(field)),
  );

  if (outcome === 'detached') {
    const { quantity: _q, ...unit } = Object.fromEntries(
      Object.entries(write.unit ?? {}).filter(([field]) => !isStateField(field)),
    );
    const from = next.quantity ?? 1;
    // The copy taken: from the cell chosen, an unplaced one, or by the
    // automatic rule. Single cigars share the group's one cell, which stays
    // with the group: never asked.
    const slots = single || changesCellar ? [] : lineSlots ?? await liveSlotsOf(tx, item.id);
    const taken = takenSlot(slots, from, choice);
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
    };
    await tx.inventoryItem.create({ data: writable(sub) as never });
    // Cells freed so far were the group's (a cellar change).
    const groupSlots = slotChanges.splice(0);
    // Opened, the copy takes the cell it came from; finished, it frees it.
    if (taken) {
      if (isFinishedState(next)) await freeSlots(tx, item.id, [taken.id]);
      else await moveSlots(tx, [taken.id], subId);
      groupSlots.push(...slotsFreed([taken]));
    }
    // Written once its cells are settled: the row answered carries them.
    const group = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { ...unit, quantity: (next.quantity ?? 1) - 1, ...stamp } as never,
      include,
    });
    const created = await tx.inventoryItem.findUniqueOrThrow({ where: { id: subId }, include });
    // A count in progress follows the copy that left (FEAT-100).
    await followDetach(tx, item.id, from - 1, {
      id: subId, cellarId: (created as { cellarId: string | null }).cellarId, finished: isFinishedState(next),
    });
    // The opened copy now holds the cell it was taken from.
    if (taken && !isFinishedState(next)) slotChanges.push(...slotsPlaced([taken]));
    return {
      outcome, ...done, data: created as R, changed: [group as R], removedIds: [],
      groupChange: { itemId: item.id, from, to: from - 1, ...(groupSlots.length > 0 ? { slotChanges: groupSlots } : {}) },
    };
  }

  if (outcome === 'reattached') {
    const parent = await tx.inventoryItem.findFirst({ where: { id: item.parentItemId!, deletedAt: null, writtenOffAt: null } });
    const fits = parent != null
      && parent.productId === item.productId
      && isGroupableItem(parent)
      && groupKey(parent, context.kind) === groupKey(next, context.kind)
      && await slotsJoin(tx, item.id, parent.id, context.kind, next);
    if (fits) return { ...(await absorb<I, R>(tx, item, next, parent, write.keepTastings, { include, stamp })), ...done };
    const regrouped = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { ...writable(changedColumns(item, next)), parentItemId: null, ...stamp } as never,
      include,
    });
    return { outcome: 'regrouped', ...done, data: regrouped as R, changed: [], removedIds: [] };
  }

  // A finished or written-off unit frees its cells (#573); a count lowered
  // frees the most recent ones (automatic rule until lot S2). Before the
  // write, so the row answered carries the cells it keeps.
  slotChanges.push(...slotsFreed(await fitSlotsTo(tx, item.id, next, context.kind)));
  const updated = await tx.inventoryItem.update({
    where: { id: item.id },
    data: { ...writable(changedColumns(item, next)), ...(outcome === 'regrouped' ? { parentItemId: null } : {}), ...stamp } as never,
    include,
  });
  return { outcome, ...done, data: updated as R, changed: [], removedIds: [] };
}

/**
 * The cell the copy taken off a group of `copies` holding `slots` comes
 * from (undefined: an unplaced copy). See {@link applyState}.
 */
function takenSlot(slots: SlotRow[], copies: number, choice: SlotChoice): SlotRow | undefined {
  if (choice === 'auto') return pickSlots(slots, copies - slots.length, 1)[0];
  if (choice === 'ask') {
    if (slots.length > 0) throw slotChoiceError(SLOT_CHOICE_REQUIRED, slots, copies - slots.length);
    return undefined;
  }
  return 'fromSlotId' in choice ? slots.find((slot) => slot.id === choice.fromSlotId) : undefined;
}

/**
 * Whether a sub-record's cells can join its group's: always, except two
 * cells for a group of single cigars (one cell for the whole group).
 */
async function slotsJoin(
  tx: PrismaClientOrTx, itemId: string, parentId: string, kind: UnitKind, next: StateItem,
): Promise<boolean> {
  if (slotCapacity({ ...next, quantity: 2 }, kind) > 1) return true;
  const [mine, theirs] = await Promise.all([liveSlotsOf(tx, itemId), liveSlotsOf(tx, parentId)]);
  return mine.length === 0 || theirs.length === 0;
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
 * too, when kept (still tastings of a bottle of the cellar).
 */
async function absorb<I extends Prisma.InventoryItemInclude, R>(
  tx: PrismaClientOrTx,
  item: StateItem,
  next: StateItem,
  parent: StateItem,
  keepTastings: boolean | undefined,
  { include, stamp }: { include: I; stamp: { updatedAt: Date; updatedBy: string } },
): Promise<Omit<ApplyStateResult<R>, 'state' | 'slotChanges'>> {
  // The sub-record disappears: another field written with it would be lost.
  // Refused rather than applied to the whole group (one bottle's location or
  // value is not every bottle's).
  const others = Object.keys(changedColumns(item, next)).filter((field) => !isStateField(field) && !REATTACH_BOOKKEEPING.has(field));
  if (others.length > 0) throw stateError(400, 'FIELDS_WITH_REATTACH', { fields: others });
  const tastings = await tx.tastingNote.count({ where: { itemId: item.id } });
  if (tastings > 0 && keepTastings === undefined) throw stateError(409, TASTINGS_ON_ITEM, { count: tastings });
  if (tastings > 0 && keepTastings) {
    // Onto the group the bottle went back to (as absorbGroups does): it was
    // tasted from a bottle of the cellar — an empty `itemId` would read
    // "tasted elsewhere" (recette #471, KO 8.4).
    await tx.tastingNote.updateMany({ where: { itemId: item.id }, data: { itemId: parent.id, productId: item.productId } });
  } else if (tastings > 0) {
    await tx.tastingNote.deleteMany({ where: { itemId: item.id } });
  }

  // Marked as absorbed: a value of the opened bottle (its cellar…) never restored onto the whole group.
  await moveHistoryOnto(tx, parent.id, [item.id]);
  await tx.wishlistItem.updateMany({ where: { acquiredItemId: item.id }, data: { acquiredItemId: parent.id } });
  await tx.inventoryItem.updateMany({ where: { parentItemId: item.id }, data: { parentItemId: parent.id } });
  // One entry per unit and session: an entry of the sub-record moves to the
  // group with the number it found (FEAT-100, D15) — never read as "the whole
  // group found" — or adds that number to the group's own entry.
  const entries = await tx.inventoryCountEntry.findMany({ where: { itemId: item.id }, select: { id: true, sessionId: true, foundQuantity: true } });
  for (const entry of entries) {
    await moveCountEntry(tx, entry, entry.foundQuantity ?? (item.quantity ?? 1), { id: parent.id, quantityBefore: parent.quantity ?? 1 });
  }

  // Its cells go back to the group (same cellar: same groupKey) before it is
  // deleted, which would take them with it.
  await moveSlots(tx, (await liveSlotsOf(tx, item.id)).map((slot) => slot.id), parent.id);
  await tx.inventoryItem.delete({ where: { id: item.id } });
  const group = await tx.inventoryItem.update({
    where: { id: parent.id },
    data: {
      quantity: (parent.quantity ?? 1) + (next.quantity ?? 1),
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
 * the finished units; the cells the group gave up (automatic rule, decision
 * #471 point 75) are added to `context.slotChanges`, for its history.
 */
export async function finishUnits(
  tx: PrismaClientOrTx,
  itemId: string,
  count: number,
  context: { userId: string; now?: Date; slotChanges?: SlotChange[] },
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
    // The cells freed: the group's on a detach, the unit's own when it is the last copy.
    context.slotChanges?.push(...(result.groupChange?.slotChanges ?? []), ...result.slotChanges);
  }
  return finished;
}

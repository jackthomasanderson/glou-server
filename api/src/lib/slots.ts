import { v4 as uuidv4 } from 'uuid';
import type { PrismaClientOrTx } from './prisma';
import { AppError } from './errors';
import { slotCapacity, type UnitKind, type UnitState } from '../../../shared/units';
import {
  SLOT_CHANGED, SLOT_CHOICE_REQUIRED, SLOTS_TO_FREE_REQUIRED,
  type ItemSlotView, type SlotChoiceDetails, type SlotsToFreeDetails,
} from '../../../shared/product';

// FEAT-93 (#847): the cells of the cellar plan a unit's copies occupy, one
// `item_slots` row each. Every path that changes a unit's copies, state,
// cellar or trash goes through these helpers, in the transaction that writes
// the unit: the database guard (`item_slots_guard`, deferred to the commit)
// refuses a unit left with more live slots than its capacity.

/** A cell of the plan (1-based), as the history records it. */
export interface SlotPosition {
  column: number;
  row: number;
}

/** A live slot as the helpers read it. */
export interface SlotRow extends SlotPosition {
  id: string;
  createdAt: Date;
}

/** One history line of a slot: placed (`from` null), freed (`to` null) or moved. */
export interface SlotChange {
  field: 'slot';
  from: SlotPosition | null;
  to: SlotPosition | null;
}

const position = ({ column, row }: SlotPosition): SlotPosition => ({ column, row });

/** History lines of slots freed (or taken away by the unit they followed). */
export const slotsFreed = (slots: ReadonlyArray<SlotPosition>): SlotChange[] =>
  slots.map((slot) => ({ field: 'slot', from: position(slot), to: null }));
/** History lines of slots placed (or brought by the unit they followed). */
export const slotsPlaced = (slots: ReadonlyArray<SlotPosition>): SlotChange[] =>
  slots.map((slot) => ({ field: 'slot', from: null, to: position(slot) }));

/**
 * The live slots of a unit, most recently placed first (the order
 * {@link pickSlots} frees them in). Cells placed at the same instant — every
 * cell the migration copied (20261106120000_item_slots) — are taken from the
 * last row and column of the plan, so the choice never depends on an id.
 */
export async function liveSlotsOf(client: PrismaClientOrTx, itemId: string): Promise<SlotRow[]> {
  return client.itemSlot.findMany({
    where: { itemId, deletedAt: null },
    select: { id: true, column: true, row: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { row: 'desc' }, { column: 'desc' }],
  });
}

/**
 * Decision #471 point 75 (gestures made without the plan in sight: bulk
 * "Mark as drunk", rotating inventory, consumption plan, guests, and every
 * path until the explicit choices of FEAT-93 lot S2): `leaving` copies taken
 * out of a unit holding `slots` and `unplaced` copies come first from the
 * unplaced ones, then from the most recently placed slots. Returns the slots
 * those copies came from (`slots` in {@link liveSlotsOf} order).
 */
export function pickSlots<S>(slots: ReadonlyArray<S>, unplaced: number, leaving: number): S[] {
  return slots.slice(0, Math.max(0, Math.min(slots.length, leaving - Math.max(unplaced, 0))));
}

/** Deletes live slots of a unit (all of them, or those of `ids`); returns the cells freed. */
export async function freeSlots(client: PrismaClientOrTx, itemId: string, ids?: string[]): Promise<SlotPosition[]> {
  const slots = (await liveSlotsOf(client, itemId)).filter((slot) => ids === undefined || ids.includes(slot.id));
  if (slots.length === 0) return [];
  await client.itemSlot.deleteMany({ where: { id: { in: slots.map((slot) => slot.id) } } });
  return slots.map(position);
}

/**
 * Frees the slots a unit can no longer hold once it holds `capacity`
 * (shared/units.ts `slotCapacity`) — the automatic rule: the most recently
 * placed first. Returns the cells freed, for the history.
 */
export async function fitSlots(client: PrismaClientOrTx, itemId: string, capacity: number): Promise<SlotPosition[]> {
  const slots = await liveSlotsOf(client, itemId);
  const extra = slots.slice(0, Math.max(0, slots.length - Math.max(capacity, 0)));
  if (extra.length === 0) return [];
  await client.itemSlot.deleteMany({ where: { id: { in: extra.map((slot) => slot.id) } } });
  return extra.map(position);
}

/** {@link fitSlots} for a unit as it will be once written (its capacity read from its new state). */
export function fitSlotsTo(
  client: PrismaClientOrTx,
  itemId: string,
  unit: UnitState & { deletedAt?: Date | null },
  kind: UnitKind,
): Promise<SlotPosition[]> {
  return fitSlots(client, itemId, slotCapacity(unit, kind));
}

/** Gives slots to another unit of the same cellar (a sub-record and its group, fused groups). */
export async function moveSlots(client: PrismaClientOrTx, ids: string[], toItemId: string): Promise<void> {
  if (ids.length === 0) return;
  await client.itemSlot.updateMany({ where: { id: { in: ids } }, data: { itemId: toItemId } });
}

/** Every live slot of `fromItemId` goes to `toItemId` (same cellar); returns the cells moved. */
export async function moveAllSlots(client: PrismaClientOrTx, fromItemId: string, toItemId: string): Promise<SlotPosition[]> {
  const slots = await liveSlotsOf(client, fromItemId);
  await moveSlots(client, slots.map((slot) => slot.id), toItemId);
  return slots.map(position);
}

/** Trash: the live slots of these units go to the trash with them, same timestamp (#174). */
export async function trashSlots(client: PrismaClientOrTx, itemIds: string[], deletedAt: Date): Promise<void> {
  if (itemIds.length === 0) return;
  await client.itemSlot.updateMany({ where: { itemId: { in: itemIds }, deletedAt: null }, data: { deletedAt } });
}

/**
 * Restore (#174): a unit back from the trash takes its cells back, except a
 * cell another unit has taken since — that slot is deleted and the copy
 * comes back unplaced. Returns the cells lost that way.
 */
export async function reviveSlots(client: PrismaClientOrTx, itemIds: string[]): Promise<SlotPosition[]> {
  if (itemIds.length === 0) return [];
  const trashed = await client.itemSlot.findMany({
    where: { itemId: { in: itemIds }, deletedAt: { not: null } },
    select: { id: true, cellarId: true, column: true, row: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const lost: Array<{ id: string } & SlotPosition> = [];
  const revived: string[] = [];
  const taken = new Set<string>();
  for (const slot of trashed) {
    const cell = `${slot.cellarId}:${slot.column}:${slot.row}`;
    const occupied = taken.has(cell) || (await client.itemSlot.count({
      where: { cellarId: slot.cellarId, column: slot.column, row: slot.row, deletedAt: null },
    })) > 0;
    if (occupied) {
      lost.push(slot);
      continue;
    }
    taken.add(cell);
    revived.push(slot.id);
  }
  if (lost.length > 0) await client.itemSlot.deleteMany({ where: { id: { in: lost.map((slot) => slot.id) } } });
  if (revived.length > 0) await client.itemSlot.updateMany({ where: { id: { in: revived } }, data: { deletedAt: null } });
  return lost.map(position);
}

// ─── Explicit choices (FEAT-93 lot S2) ───────────────────────────────────────

/**
 * Which copy an opening, a drink or a smoke takes off a line: the automatic
 * rule (decision #471 point 75: gestures made without the plan in sight —
 * bulk "Mark as drunk", rotating inventory, consumption plan, guests), the
 * member's choice (a cell, or an unplaced copy), or `'ask'` — a member's
 * write without a choice, refused when the choice matters.
 */
export type SlotChoice = 'auto' | 'ask' | { fromSlotId: string } | { fromUnplaced: true };

/**
 * The cells of the copies leaving a line (freed, or following repriced
 * copies): the automatic rule, or the member's `slotIds` (absent: none
 * named).
 */
export type SlotsToFree = 'auto' | { slotIds?: string[] };

/** The live slots of a line as the API shows them: by row, then column. */
export const slotViews = (slots: ReadonlyArray<{ id: string } & SlotPosition>): ItemSlotView[] =>
  [...slots].sort((a, b) => a.row - b.row || a.column - b.column).map(({ id, column, row }) => ({ id, column, row }));

/** 409 SLOT_CHOICE_REQUIRED or SLOT_CHANGED, with the line's cells and its copies unplaced. */
export const slotChoiceError = (
  code: typeof SLOT_CHOICE_REQUIRED | typeof SLOT_CHANGED,
  slots: ReadonlyArray<{ id: string } & SlotPosition>,
  unplaced: number,
): AppError => new AppError(409, code, { details: { slots: slotViews(slots), unplaced: Math.max(0, unplaced) } satisfies SlotChoiceDetails });

/**
 * Decision #471 points 74-75 and FEAT-93 criterion 4: copies leave a line of
 * `slots` (most recently placed first, {@link liveSlotsOf}) which keeps
 * `keep` cells at most (`slotCapacity` of what stays). The cells that must
 * go with them — `slots.length - keep` — are, by the automatic rule, the
 * most recently placed (unplaced copies leave first); by the member's
 * choice, `slotIds`: at least that many, at most `most` (the copies leaving,
 * 0 when a cell is shared by the whole line), each a live slot of the line,
 * once. A choice missing when needed, or not valid: 409
 * SLOTS_TO_FREE_REQUIRED `{ needed, slots }`. Returns the slots chosen.
 */
export function slotsLeaving<S extends { id: string } & SlotPosition>(
  slots: ReadonlyArray<S>,
  keep: number,
  most: number,
  choice: SlotsToFree,
): S[] {
  const needed = Math.max(0, slots.length - Math.max(keep, 0));
  if (choice === 'auto') return slots.slice(0, needed);
  const ids = choice.slotIds;
  if (ids === undefined && needed === 0) return [];
  if (ids !== undefined) {
    const chosen = slots.filter((slot) => ids.includes(slot.id));
    const valid = new Set(ids).size === ids.length && chosen.length === ids.length
      && ids.length >= needed && ids.length <= Math.min(Math.max(most, needed), slots.length);
    if (valid) return chosen;
  }
  throw new AppError(409, SLOTS_TO_FREE_REQUIRED, { details: { needed, slots: slotViews(slots) } satisfies SlotsToFreeDetails });
}

/**
 * "Annuler" of a line finished in place (FEAT-93 lot S2, `placeAt`): the copy
 * put back takes its cell again — if the line is in a cellar whose grid
 * holds that cell, still has a copy unplaced, and nobody took the cell
 * since (the partial unique index decides, without failing the
 * transaction). Otherwise it stays unplaced. Returns the cell placed, or null.
 */
export async function placeBack(
  client: PrismaClientOrTx,
  unit: UnitState & { id: string; cellarId: string | null },
  kind: UnitKind,
  at: SlotPosition,
): Promise<SlotPosition | null> {
  if (!unit.cellarId) return null;
  const cellar = await client.cellar.findUnique({ where: { id: unit.cellarId }, select: { columns: true, rows: true } });
  if (!cellar || cellar.columns == null || cellar.rows == null || at.column > cellar.columns || at.row > cellar.rows) return null;
  const placed = await client.itemSlot.count({ where: { itemId: unit.id, deletedAt: null } });
  if (placed >= slotCapacity(unit, kind)) return null;
  const inserted = await client.$executeRaw`INSERT INTO "item_slots" ("id", "itemId", "cellarId", "column", "row")
    VALUES (${uuidv4()}, ${unit.id}, ${unit.cellarId}, ${at.column}, ${at.row})
    ON CONFLICT ("cellarId", "column", "row") WHERE "deletedAt" IS NULL DO NOTHING`;
  return inserted > 0 ? position(at) : null;
}

/**
 * A unique-index violation (P2002) raised by a write that only places or
 * moves slots: the cell was taken meanwhile (`item_slots_cell_unique`, the
 * only unique index of `item_slots` besides its uuid key).
 */
export const isCellTaken = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2002';

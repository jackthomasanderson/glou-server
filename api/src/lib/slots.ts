import type { PrismaClientOrTx } from './prisma';
import { slotCapacity, type UnitKind, type UnitState } from '../../../shared/units';

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

/**
 * A unique-index violation (P2002) raised by a write that only places or
 * moves slots: the cell was taken meanwhile (`item_slots_cell_unique`, the
 * only unique index of `item_slots` besides its uuid key).
 */
export const isCellTaken = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2002';

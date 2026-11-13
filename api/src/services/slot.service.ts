import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { AppError, notFound } from '../lib/errors';
import { lockFamilies, lockFamily } from '../lib/product-fields';
import { isCellTaken, type SlotChange, type SlotPosition } from '../lib/slots';
import { slotCapacity, unitKind } from '../lib/finished-item';
import type { ItemSlotView } from '../../../shared/product';

// FEAT-93 (#847): the gestures of the cellar plan — place a copy of a unit in
// a cell, move a slot to another cell, take it out, swap two slots. Each
// locks the unit's family first (the locking rule), then checks what the
// database also guarantees (one live slot per cell, a slot in its unit's
// cellar, no more slots than copies) to answer with a typed error. None
// touches the unit's `updatedAt`: arranging the plan must not turn a change
// queued offline against the unit into a conflict.

/** A slot written, and the history line of its unit. */
export interface SlotWrite {
  itemId: string;
  productId: string;
  slot: ItemSlotView;
  change: SlotChange;
}

const cell = ({ column, row }: SlotPosition): SlotPosition => ({ column, row });
const view = (slot: { id: string; column: number; row: number }): ItemSlotView => ({ id: slot.id, column: slot.column, row: slot.row });

const slotError = (status: number, code: string, details?: unknown) => new AppError(status, code, { details });

/**
 * The cell is in the cellar's grid (a cellar without a grid has no cell).
 * #852: the cellar row is read FOR SHARE, until the caller's transaction
 * ends — a grid made smaller (CellarService.updateCellar, FOR UPDATE) waits
 * for this copy to be placed and then sees it, or this placement waits for
 * the new size: never a copy left outside the grid.
 */
async function assertInGrid(client: PrismaClientOrTx, cellarId: string, at: SlotPosition): Promise<void> {
  const [cellar] = await client.$queryRaw<Array<{ columns: number | null; rows: number | null }>>`
    SELECT "columns", "rows" FROM "cellars" WHERE "id" = ${cellarId} FOR SHARE`;
  if (!cellar || cellar.columns == null || cellar.rows == null || at.column > cellar.columns || at.row > cellar.rows) {
    throw slotError(400, 'OUTSIDE_GRID');
  }
}

/** No live slot holds the cell (the partial unique index decides; this answers first). */
async function assertFree(client: PrismaClientOrTx, cellarId: string, at: SlotPosition, exceptSlotId?: string): Promise<void> {
  const occupant = await client.itemSlot.findFirst({
    where: { cellarId, column: at.column, row: at.row, deletedAt: null, ...(exceptSlotId ? { id: { not: exceptSlotId } } : {}) },
    select: { id: true },
  });
  if (occupant) throw slotError(409, 'SLOT_OCCUPIED');
}

/** A write that may meet a cell taken in the instant since the check: the same 409. */
async function inCell<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isCellTaken(error)) throw slotError(409, 'SLOT_OCCUPIED');
    throw error;
  }
}

/** A live slot with its unit's family, or 404. */
async function liveSlot(client: PrismaClientOrTx, slotId: string) {
  const slot = await client.itemSlot.findFirst({
    where: { id: slotId, deletedAt: null },
    include: { item: { select: { productId: true } } },
  });
  if (!slot) throw notFound('SLOT_NOT_FOUND');
  return slot;
}

export const slotService = {
  /**
   * POST /api/inventory/:id/slots — one more copy of the unit in `at`. Only a
   * unit in stock, in a cellar with a grid, with a copy still unplaced
   * (FEAT-93 criterion 2: "Les 6 bouteilles de cette ligne sont déjà rangées").
   */
  async place(itemId: string, at: SlotPosition): Promise<SlotWrite> {
    return inCell(() => prisma.$transaction(async (tx) => {
      const first = await tx.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { productId: true } });
      if (!first) throw notFound('ITEM_NOT_FOUND');
      await lockFamily(tx, first.productId);
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
        include: { product: { select: { category: true } }, _count: { select: { slots: { where: { deletedAt: null } } } } },
      });
      if (!item) throw notFound('ITEM_NOT_FOUND');
      const capacity = slotCapacity(item, unitKind(item.product.category));
      if (capacity === 0) throw slotError(409, 'NOT_IN_STOCK');
      if (!item.cellarId) throw slotError(400, 'NO_CELLAR');
      await assertInGrid(tx, item.cellarId, at);
      const placed = item._count.slots;
      if (placed >= capacity) throw slotError(409, 'NO_UNPLACED_COPY', { quantity: capacity, placed });
      await assertFree(tx, item.cellarId, at);
      const slot = await tx.itemSlot.create({ data: { itemId, cellarId: item.cellarId, column: at.column, row: at.row } });
      return { itemId, productId: item.productId, slot: view(slot), change: { field: 'slot', from: null, to: cell(at) } };
    }));
  },

  /** PATCH /api/slots/:slotId — the copy moves to another cell of the same cellar. */
  async move(slotId: string, at: SlotPosition): Promise<SlotWrite> {
    return inCell(() => prisma.$transaction(async (tx) => {
      await lockFamily(tx, (await liveSlot(tx, slotId)).item.productId);
      const slot = await liveSlot(tx, slotId);
      await assertInGrid(tx, slot.cellarId, at);
      await assertFree(tx, slot.cellarId, at, slot.id);
      const moved = await tx.itemSlot.update({ where: { id: slot.id }, data: { column: at.column, row: at.row } });
      return { itemId: slot.itemId, productId: slot.item.productId, slot: view(moved), change: { field: 'slot', from: cell(slot), to: cell(at) } };
    }));
  },

  /** DELETE /api/slots/:slotId — the copy leaves its cell and stays in stock, unplaced. */
  async remove(slotId: string): Promise<SlotWrite> {
    return prisma.$transaction(async (tx) => {
      await lockFamily(tx, (await liveSlot(tx, slotId)).item.productId);
      const slot = await liveSlot(tx, slotId);
      await tx.itemSlot.delete({ where: { id: slot.id } });
      return { itemId: slot.itemId, productId: slot.item.productId, slot: view(slot), change: { field: 'slot', from: cell(slot), to: null } };
    });
  },

  /**
   * POST /api/cellars/:id/swap-slots (ISSUE_037) — two copies exchange their
   * cells: each slot takes the other's unit, so no cell is ever held twice
   * and the unique index is never touched. Both in this cellar, of two
   * different lines: two cells of one line exchanged change nothing, refused
   * (400 SAME_LINE_SLOTS) rather than written to its history as two moves.
   */
  async swap(cellarId: string, slotAId: string, slotBId: string): Promise<[SlotWrite, SlotWrite]> {
    return prisma.$transaction(async (tx) => {
      const read = () => Promise.all([liveSlot(tx, slotAId), liveSlot(tx, slotBId)]);
      const [firstA, firstB] = await read();
      // #471 (lock order): both families first, in sorted order.
      await lockFamilies(tx, [firstA.item.productId, firstB.item.productId]);
      const [a, b] = await read();
      if (a.cellarId !== cellarId || b.cellarId !== cellarId) throw notFound('SLOT_NOT_FOUND');
      if (a.itemId === b.itemId) throw new AppError(400, 'SAME_LINE_SLOTS');
      await tx.itemSlot.update({ where: { id: a.id }, data: { itemId: b.itemId } });
      await tx.itemSlot.update({ where: { id: b.id }, data: { itemId: a.itemId } });
      return [
        { itemId: a.itemId, productId: a.item.productId, slot: view(b), change: { field: 'slot', from: cell(a), to: cell(b) } },
        { itemId: b.itemId, productId: b.item.productId, slot: view(a), change: { field: 'slot', from: cell(b), to: cell(a) } },
      ];
    });
  },
};

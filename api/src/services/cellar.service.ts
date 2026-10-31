import { prisma } from '../lib/prisma';
import { CreateCellarInput, UpdateCellarInput, SwapSlotsInput } from '../schemas/cellar.schema';
import type { Prisma } from '@prisma/client';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { lockFamilies } from '../lib/product-fields';
import { UNIT_COUNT_SELECT, sumTotals, type UnitTotalsRow } from '../lib/stock-units';
import type { CellarStats } from '../../../shared/cellar';

export type SwapSlotsResult =
  | { status: 'not_found' }
  | { status: 'not_in_grid' }
  | { status: 'success'; items: [{ id: string; slotColumn: number | null; slotRow: number | null }, { id: string; slotColumn: number | null; slotRow: number | null }] };

/**
 * ISSUE_239 + #573 + #471 (FEAT-96): a cellar card counts and values what the
 * cellar still holds, in bottles and cigars (`itemUnits`) and with the value
 * rule of the analytics (`itemValue`, #594) — the same figures as the sidebar
 * and the analytics. A finished or written-off unit stays in the inventory for
 * its history, but is neither counted nor valued here.
 */
const CELLAR_STOCK_SELECT = {
  ...UNIT_COUNT_SELECT,
  cellarId: true,
  productId: true,
  product: { select: { category: true, reminderDate: true } },
} satisfies Prisma.InventoryItemSelect;

type CellarStockRow = UnitTotalsRow & {
  cellarId: string | null;
  productId: string;
  product: { reminderDate: Date | null };
};

/** End of "today" in the instance's time zone (`TZ`, #575), like the sidebar's reminder count. */
function endOfToday(): Date {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

function cellarStats(rows: CellarStockRow[], today: Date): CellarStats {
  const { bottles, cigars, value } = sumTotals(rows);
  // #471: the reminder is on the family — a wine with 6 bottles here is one reminder.
  const dueFamilies = new Set(
    rows.filter((row) => row.product.reminderDate != null && row.product.reminderDate <= today).map((row) => row.productId),
  );
  return {
    bottles,
    cigars,
    totalItems: bottles + cigars,
    estimatedValue: value > 0 ? value : null,
    alertCount: dueFamilies.size,
  };
}

export class CellarService {
  static async createCellar(userId: string, data: CreateCellarInput) {
    return prisma.cellar.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  static async listCellars(_userId: string) {
    const cellars = await prisma.cellar.findMany({ orderBy: { createdAt: 'desc' } });
    if (cellars.length === 0) return [];

    const rows = await prisma.inventoryItem.findMany({
      where: { cellarId: { in: cellars.map((c) => c.id) }, ...IN_STOCK_ITEM_FILTER },
      select: CELLAR_STOCK_SELECT,
    });
    const rowsByCellar = new Map<string, CellarStockRow[]>();
    for (const row of rows) {
      if (!row.cellarId) continue;
      const cellarRows = rowsByCellar.get(row.cellarId);
      if (cellarRows) cellarRows.push(row);
      else rowsByCellar.set(row.cellarId, [row]);
    }

    const today = endOfToday();
    return cellars.map((cellar) => ({ ...cellar, stats: cellarStats(rowsByCellar.get(cellar.id) ?? [], today) }));
  }

  static async getCellar(_userId: string, id: string) {
    const cellar = await prisma.cellar.findFirst({ where: { id } });
    if (!cellar) return null;

    const rows = await prisma.inventoryItem.findMany({
      where: { cellarId: id, ...IN_STOCK_ITEM_FILTER },
      select: CELLAR_STOCK_SELECT,
    });
    return { ...cellar, stats: cellarStats(rows, endOfToday()) };
  }

  static async updateCellar(userId: string, id: string, data: UpdateCellarInput) {
    const cellar = await prisma.cellar.findFirst({ where: { id } });
    if (!cellar) return null;

    return prisma.cellar.update({
      where: { id },
      data,
    });
  }

  static async deleteCellar(userId: string, id: string) {
    const cellar = await prisma.cellar.findFirst({ where: { id } });
    if (!cellar) return null;

    return prisma.cellar.delete({ where: { id } });
  }

  static async getGridData(userId: string, cellarId: string) {
    const cellar = await prisma.cellar.findFirst({ where: { id: cellarId } });
    if (!cellar) return null;

    const items = await prisma.inventoryItem.findMany({
      // #573: the map shows what is on the shelves — a finished bottle has
      // given its slot back (lib/finished-item.ts `NO_SLOT`), and a FEAT-87
      // reference was never on one.
      where: { cellarId, ...IN_STOCK_ITEM_FILTER },
      select: {
        id: true,
        name: true,
        producer: true,
        category: true,
        color: true,
        vintage: true,
        slotColumn: true,
        slotRow: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { cellar, items };
  }

  /**
   * ISSUE_037: swapping two occupied grid slots used to be three independent
   * network calls (clear source, move target, move dragged), so a dropped
   * connection between any two of them left the database half-updated with
   * no way for the client to tell. Both updates now happen inside a single
   * `prisma.$transaction` — mirroring the pattern already used by
   * `inventory-count.service.ts#applyCorrections` — so the swap either fully
   * applies or leaves the grid exactly as it was.
   */
  static async swapSlots(_userId: string, cellarId: string, data: SwapSlotsInput): Promise<SwapSlotsResult> {
    const [itemA, itemB] = await Promise.all([
      prisma.inventoryItem.findFirst({ where: { id: data.itemAId, cellarId, deletedAt: null } }),
      prisma.inventoryItem.findFirst({ where: { id: data.itemBId, cellarId, deletedAt: null } }),
    ]);

    if (!itemA || !itemB) return { status: 'not_found' };
    if (itemA.slotColumn == null || itemA.slotRow == null || itemB.slotColumn == null || itemB.slotRow == null) {
      return { status: 'not_in_grid' };
    }

    // #173's partial unique index on (cellarId, slotColumn, slotRow) is
    // checked immediately after each statement (Postgres can't defer a
    // partial unique index to commit), so moving A straight onto B's slot
    // while B still holds it would violate the constraint mid-transaction.
    // Freeing A's slot first, then moving B into it, then moving A into B's
    // former (now-free) slot avoids ever having two rows claim the same
    // slot at once.
    // #471 (lock order, #787 review): both families locked first, in sorted
    // order, before either unit is written (no deadlock with a description
    // write, which locks the family and then copies onto its units).
    const [updatedB, updatedA] = await prisma.$transaction(async (tx) => {
      await lockFamilies(tx, [itemA.productId, itemB.productId]);
      await tx.inventoryItem.update({
        where: { id: itemA.id },
        data: { slotColumn: null, slotRow: null },
      });
      const movedB = await tx.inventoryItem.update({
        where: { id: itemB.id },
        data: { slotColumn: itemA.slotColumn, slotRow: itemA.slotRow },
      });
      const movedA = await tx.inventoryItem.update({
        where: { id: itemA.id },
        data: { slotColumn: itemB.slotColumn, slotRow: itemB.slotRow },
      });
      return [movedB, movedA] as const;
    });

    return {
      status: 'success',
      items: [
        { id: updatedA.id, slotColumn: updatedA.slotColumn, slotRow: updatedA.slotRow },
        { id: updatedB.id, slotColumn: updatedB.slotColumn, slotRow: updatedB.slotRow },
      ],
    };
  }
}

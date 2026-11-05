import { prisma } from '../lib/prisma';
import { CreateCellarInput, UpdateCellarInput } from '../schemas/cellar.schema';
import type { Cellar, Prisma } from '@prisma/client';
import { IN_STOCK_ITEM_FILTER, itemUnits, slotCapacity, unitKind } from '../lib/finished-item';
import { UNIT_SLOTS } from '../lib/product-fields';
import { UNIT_COUNT_SELECT, sumTotals, type UnitTotalsRow } from '../lib/stock-units';
import type { CellarStats, GridLine } from '../../../shared/cellar';

/** GET /api/cellars/:id/grid (FEAT-68, FEAT-93). */
export interface CellarGrid {
  cellar: Cellar;
  items: GridLine[];
}

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

  static async getGridData(userId: string, cellarId: string): Promise<CellarGrid | null> {
    const cellar = await prisma.cellar.findFirst({ where: { id: cellarId } });
    if (!cellar) return null;

    const items = await prisma.inventoryItem.findMany({
      // #573: the map shows what is on the shelves — a finished bottle has
      // given its cells back, and a family without units was never on one.
      where: { cellarId, ...IN_STOCK_ITEM_FILTER },
      select: {
        id: true,
        productId: true,
        ...UNIT_COUNT_SELECT,
        purchasePrice: true,
        purchasedAt: true,
        ...UNIT_SLOTS,
        product: { select: { name: true, producer: true, category: true, color: true, vintage: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // FEAT-93: a line holds one cell per copy placed (`slots`) and says how
    // many are still unplaced; a group of single cigars takes one cell for
    // the group. Recette #471 (KO 13.2): `units` (bottles, or the cigars of a
    // box), and what tells two lines of the same wine apart in "Assigner"
    // (closed box or opened, price, purchase day).
    return {
      cellar,
      items: items.map(({ id, productId, slots, quantity, isOpened, cigarsPerBox, cigarsLeft, purchasePrice, purchasedAt, product, ...state }) => ({
        id,
        productId,
        ...product,
        quantity: isOpened ? 1 : Math.max(quantity ?? 1, 1),
        units: itemUnits({ quantity, isOpened, cigarsPerBox, cigarsLeft, ...state }),
        isOpened,
        cigarsPerBox,
        cigarsLeft,
        purchasePrice: purchasePrice == null ? null : Number(purchasePrice),
        purchasedAt: purchasedAt ? purchasedAt.toISOString().slice(0, 10) : null,
        slots,
        unplaced: Math.max(
          slotCapacity({ quantity, isOpened, cigarsPerBox, cigarsLeft, ...state }, unitKind(product.category)) - slots.length, 0),
      })),
    };
  }
}

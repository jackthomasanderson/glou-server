import { prisma } from '../lib/prisma';
import { CreateCellarInput, UpdateCellarInput, SwapSlotsInput } from '../schemas/cellar.schema';

export type SwapSlotsResult =
  | { status: 'not_found' }
  | { status: 'not_in_grid' }
  | { status: 'success'; items: [{ id: string; slotColumn: number | null; slotRow: number | null }, { id: string; slotColumn: number | null; slotRow: number | null }] };

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

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const cellarIds = cellars.map((c) => c.id);

    const [aggGroups, alertGroups] = await Promise.all([
      prisma.inventoryItem.groupBy({
        by: ['cellarId'],
        where: { cellarId: { in: cellarIds }, deletedAt: null },
        _count: { id: true },
        _sum: { estimatedValue: true, quantity: true },
      }),
      prisma.inventoryItem.groupBy({
        by: ['cellarId'],
        where: { cellarId: { in: cellarIds }, deletedAt: null, reminderDate: { lte: today } },
        _count: { id: true },
      }),
    ]);

    const aggMap = new Map(aggGroups.map((g) => [g.cellarId, g]));
    const alertMap = new Map(alertGroups.map((g) => [g.cellarId, g._count.id]));

    return cellars.map((cellar) => {
      const agg = aggMap.get(cellar.id);
      return {
        ...cellar,
        stats: {
          totalItems: agg?._count.id ?? 0,
          totalQuantity: agg?._sum.quantity ?? 0,
          estimatedValue: agg?._sum.estimatedValue ?? null,
          alertCount: alertMap.get(cellar.id) ?? 0,
        },
      };
    });
  }

  static async getCellar(_userId: string, id: string) {
    const cellar = await prisma.cellar.findFirst({ where: { id } });
    if (!cellar) return null;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const [agg, alertCount] = await Promise.all([
      prisma.inventoryItem.aggregate({
        where: { cellarId: id, deletedAt: null },
        _count: { id: true },
        _sum: { estimatedValue: true, quantity: true },
      }),
      prisma.inventoryItem.count({
        where: { cellarId: id, deletedAt: null, reminderDate: { lte: today } },
      }),
    ]);

    return {
      ...cellar,
      stats: {
        totalItems: agg._count.id,
        totalQuantity: agg._sum.quantity ?? 0,
        estimatedValue: agg._sum.estimatedValue ?? null,
        alertCount,
      },
    };
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
      where: { cellarId, deletedAt: null },
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

    const [updatedA, updatedB] = await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: itemA.id },
        data: { slotColumn: itemB.slotColumn, slotRow: itemB.slotRow },
      }),
      prisma.inventoryItem.update({
        where: { id: itemB.id },
        data: { slotColumn: itemA.slotColumn, slotRow: itemA.slotRow },
      }),
    ]);

    return {
      status: 'success',
      items: [
        { id: updatedA.id, slotColumn: updatedA.slotColumn, slotRow: updatedA.slotRow },
        { id: updatedB.id, slotColumn: updatedB.slotColumn, slotRow: updatedB.slotRow },
      ],
    };
  }
}

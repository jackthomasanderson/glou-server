import { prisma } from '../lib/prisma';
import { CreateCellarInput, UpdateCellarInput } from '../schemas/cellar.schema';

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
}

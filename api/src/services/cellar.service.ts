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
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return Promise.all(
      cellars.map(async (cellar) => {
        const [agg, alertCount] = await Promise.all([
          prisma.inventoryItem.aggregate({
            where: { cellarId: cellar.id, deletedAt: null },
            _count: { id: true },
            _sum: { estimatedValue: true, quantity: true },
          }),
          prisma.inventoryItem.count({
            where: { cellarId: cellar.id, deletedAt: null, reminderDate: { lte: today } },
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
      })
    );
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

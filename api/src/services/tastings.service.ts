import { prisma } from '../lib/prisma';
import { TastingCreateInput, TastingPatchInput } from '../schemas/tastings.schema';

const ITEM_SELECT = {
  id: true,
  name: true,
  producer: true,
  category: true,
  photoUrl: true,
  color: true,
  spiritType: true,
  sparklingType: true,
  format: true,
} as const;

const DEFAULT_PAGE_SIZE = 20;

export const tastingsService = {
  async list(userId: string, page = 1, limit = DEFAULT_PAGE_SIZE, itemId?: string) {
    const skip = (page - 1) * limit;
    const where = { userId, ...(itemId ? { itemId } : {}) };
    const [notes, total] = await Promise.all([
      prisma.tastingNote.findMany({
        where,
        include: { item: { select: ITEM_SELECT } },
        orderBy: { tastedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tastingNote.count({ where }),
    ]);
    return { notes, total, page, limit };
  },

  async create(userId: string, data: TastingCreateInput) {
    if (data.itemId) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: data.itemId, userId, deletedAt: null },
      });
      if (!item) return null;
    }
    return prisma.tastingNote.create({
      data: {
        userId,
        ...data,
        tastedAt: data.tastedAt ? new Date(data.tastedAt) : new Date(),
      },
      include: { item: { select: ITEM_SELECT } },
    });
  },

  async update(id: string, userId: string, data: TastingPatchInput) {
    const existing = await prisma.tastingNote.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return prisma.tastingNote.update({
      where: { id },
      data: {
        ...data,
        tastedAt: data.tastedAt ? new Date(data.tastedAt) : undefined,
      },
      include: { item: { select: ITEM_SELECT } },
    });
  },

  async delete(id: string, userId: string) {
    const existing = await prisma.tastingNote.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return prisma.tastingNote.delete({ where: { id } });
  },
};

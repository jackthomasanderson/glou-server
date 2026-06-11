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

  async itemStats(userId: string, itemId: string) {
    const notes = await prisma.tastingNote.findMany({
      where: { userId, itemId },
      select: { rating: true, readiness: true, tastedAt: true },
      orderBy: { tastedAt: 'desc' },
    });
    if (notes.length === 0) return null;
    const rated = notes.filter((n) => n.rating != null);
    const avgRating = rated.length > 0
      ? Math.round((rated.reduce((s, n) => s + n.rating!, 0) / rated.length) * 10) / 10
      : null;
    const last = notes[0];
    return {
      count: notes.length,
      avgRating,
      lastTastedAt: last.tastedAt,
      lastRating: last.rating ?? null,
      lastReadiness: last.readiness ?? null,
    };
  },

  async analytics(userId: string) {
    const notes = await prisma.tastingNote.findMany({
      where: { userId, itemId: { not: null } },
      select: {
        rating: true,
        readiness: true,
        item: { select: { id: true, name: true, producer: true } },
      },
    });

    // Producer rankings
    const byProducer: Record<string, { ratings: number[]; producer: string }> = {};
    for (const n of notes) {
      if (!n.item?.producer || n.rating == null) continue;
      const key = n.item.producer;
      if (!byProducer[key]) byProducer[key] = { ratings: [], producer: key };
      byProducer[key].ratings.push(n.rating);
    }
    const producerRankings = Object.values(byProducer)
      .map((p) => ({
        producer: p.producer,
        avgRating: Math.round((p.ratings.reduce((s, r) => s + r, 0) / p.ratings.length) * 10) / 10,
        count: p.ratings.length,
      }))
      .sort((a, b) => b.avgRating - a.avgRating);

    // Item top/flop
    const byItem: Record<string, { ratings: number[]; name: string; producer: string }> = {};
    for (const n of notes) {
      if (!n.item || n.rating == null) continue;
      const key = n.item.id;
      if (!byItem[key]) byItem[key] = { ratings: [], name: n.item.name, producer: n.item.producer };
      byItem[key].ratings.push(n.rating);
    }
    const itemStats = Object.entries(byItem)
      .map(([id, v]) => ({
        id,
        name: v.name,
        producer: v.producer,
        avgRating: Math.round((v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length) * 10) / 10,
        count: v.ratings.length,
      }))
      .filter((i) => i.count >= 1)
      .sort((a, b) => b.avgRating - a.avgRating);

    const topItems = itemStats.slice(0, 5);
    const flopItems = itemStats.slice(-5).reverse();

    // Readiness distribution
    const readinessCounts = { TOO_YOUNG: 0, PERFECT: 0, PEAK: 0, PAST: 0 };
    for (const n of notes) {
      if (n.readiness && n.readiness in readinessCounts) {
        readinessCounts[n.readiness as keyof typeof readinessCounts]++;
      }
    }

    return { producerRankings, topItems, flopItems, readinessDistribution: readinessCounts };
  },
};

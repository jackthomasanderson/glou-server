import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { count: vi.fn() },
    cellar: { count: vi.fn() },
    collection: { count: vi.fn() },
    inventoryCountSession: { findFirst: vi.fn() },
    wishlistItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { statsService } from '../src/services/stats.service';

const db = prisma as unknown as {
  inventoryItem: { count: ReturnType<typeof vi.fn> };
  cellar: { count: ReturnType<typeof vi.fn> };
  collection: { count: ReturnType<typeof vi.fn> };
  inventoryCountSession: { findFirst: ReturnType<typeof vi.fn> };
  wishlistItem: { findMany: ReturnType<typeof vi.fn> };
};

describe('statsService.getSidebarCounts (#212)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.inventoryItem.count.mockImplementation(({ where }: { where: { category?: string; reminderDate?: unknown } }) =>
      Promise.resolve(where.category === 'cigar' ? 4 : where.reminderDate ? 1 : 10),
    );
    db.cellar.count.mockResolvedValue(2);
    db.collection.count.mockResolvedValue(3);
    db.inventoryCountSession.findFirst.mockResolvedValue(null);
    db.wishlistItem.findMany.mockResolvedValue([]);
  });

  it('returns every badge in one call, excluding soft-deleted items', async () => {
    const counts = await statsService.getSidebarCounts('u1');
    expect(counts).toEqual({
      bottles: 10, cigars: 4, cellars: 2, collections: 3, countSessionActive: false, wishlistReady: 0, remindersToday: 1,
    });
    for (const [arg] of db.inventoryItem.count.mock.calls) expect(arg.where.deletedAt).toBeNull();
    expect(db.collection.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('flags an active or paused count session', async () => {
    db.inventoryCountSession.findFirst.mockResolvedValue({ id: 's1' });
    expect((await statsService.getSidebarCounts('u1')).countSessionActive).toBe(true);
  });

  it('counts only wishlist items already at or under the price ceiling', async () => {
    db.wishlistItem.findMany.mockResolvedValue([
      { lastSeenPrice: 10, maxPrice: 12 },
      { lastSeenPrice: 12, maxPrice: 12 },
      { lastSeenPrice: 20, maxPrice: 12 },
    ]);
    expect((await statsService.getSidebarCounts('u1')).wishlistReady).toBe(2);
  });
});

// FEAT-87: the sidebar badges count what the instance holds, so a non-owned
// reference is not a bottle in the badge.
describe('statsService.getSidebarCounts excludes non-owned references (FEAT-87)', () => {
  it('restricts every inventory count to owned items', async () => {
    vi.clearAllMocks();
    db.inventoryItem.count.mockResolvedValue(0);
    db.cellar.count.mockResolvedValue(0);
    db.collection.count.mockResolvedValue(0);
    db.inventoryCountSession.findFirst.mockResolvedValue(null);
    db.wishlistItem.findMany.mockResolvedValue([]);

    await statsService.getSidebarCounts('u1');

    const wheres = db.inventoryItem.count.mock.calls.map(
      (c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where,
    );
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where).toMatchObject({ deletedAt: null, isOwned: true });
    }
  });
});

// #573: a finished bottle (opened, nothing left) stays in the inventory for
// its history, but the badges count what is in stock — like the inventory list
// counter (#504) and the cellar cards. A reminder is not stock: it still counts.
describe('statsService.getSidebarCounts counts only bottles in stock (#573)', () => {
  it('leaves finished bottles out of the bottle and cigar badges, not out of the reminders', async () => {
    vi.clearAllMocks();
    db.inventoryItem.count.mockResolvedValue(0);
    db.cellar.count.mockResolvedValue(0);
    db.collection.count.mockResolvedValue(0);
    db.inventoryCountSession.findFirst.mockResolvedValue(null);
    db.wishlistItem.findMany.mockResolvedValue([]);

    await statsService.getSidebarCounts('u1');

    const inStock = {
      deletedAt: null,
      isOwned: true,
      // `not: null` keeps an opened bottle with no recorded level counted.
      NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
    };
    expect(db.inventoryItem.count).toHaveBeenCalledTimes(3);
    expect(db.inventoryItem.count).toHaveBeenNthCalledWith(1, {
      where: { ...inStock, category: { in: ['wine', 'sparkling', 'spirit'] } },
    });
    expect(db.inventoryItem.count).toHaveBeenNthCalledWith(2, { where: { ...inStock, category: 'cigar' } });
    expect(db.inventoryItem.count).toHaveBeenNthCalledWith(3, {
      where: { deletedAt: null, isOwned: true, reminderDate: { not: null, lte: expect.any(Date) } },
    });
  });
});

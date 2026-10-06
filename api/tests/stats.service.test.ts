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
    db.inventoryItem.count.mockImplementation(({ where }) =>
      Promise.resolve(where.category === 'cigar' ? 4 : 10),
    );
    db.cellar.count.mockResolvedValue(2);
    db.collection.count.mockResolvedValue(3);
    db.inventoryCountSession.findFirst.mockResolvedValue(null);
    db.wishlistItem.findMany.mockResolvedValue([]);
  });

  it('returns every badge in one call, excluding soft-deleted items', async () => {
    const counts = await statsService.getSidebarCounts('u1');
    expect(counts).toEqual({
      bottles: 10, cigars: 4, cellars: 2, collections: 3, countSessionActive: false, wishlistReady: 0,
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

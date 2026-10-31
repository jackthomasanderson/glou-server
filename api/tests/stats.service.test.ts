import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { groupBy: vi.fn() },
    product: { count: vi.fn() },
    cellar: { count: vi.fn() },
    collection: { count: vi.fn() },
    inventoryCountSession: { findFirst: vi.fn() },
    wishlistItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import { statsService } from '../src/services/stats.service';

const db = prisma as unknown as {
  inventoryItem: { groupBy: ReturnType<typeof vi.fn> };
  product: { count: ReturnType<typeof vi.fn> };
  cellar: { count: ReturnType<typeof vi.fn> };
  collection: { count: ReturnType<typeof vi.fn> };
  inventoryCountSession: { findFirst: ReturnType<typeof vi.fn> };
  wishlistItem: { findMany: ReturnType<typeof vi.fn> };
};

/** The in-stock scope, spelled out to pin the SQL shape (lib/finished-item.ts). */
const IN_STOCK = {
  deletedAt: null,
  writtenOffAt: null,
  isOwned: true,
  // `not: null` keeps an opened bottle with no recorded level counted.
  NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
};

/** A group of units in the same state, as the `groupBy` returns it (#471). */
function state(count: number, overrides: Record<string, unknown> = {}) {
  return { quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, _count: { _all: count }, ...overrides };
}

/** Answers the bottle query and the cigar query with their own groups. */
function stock(bottles: unknown[], cigars: unknown[]) {
  db.inventoryItem.groupBy.mockImplementation(({ where }: { where: { product: { category: unknown } } }) =>
    Promise.resolve(where.product.category === 'cigar' ? cigars : bottles));
}

beforeEach(() => {
  vi.clearAllMocks();
  stock([], []);
  db.product.count.mockResolvedValue(0);
  db.cellar.count.mockResolvedValue(2);
  db.collection.count.mockResolvedValue(3);
  db.inventoryCountSession.findFirst.mockResolvedValue(null);
  db.wishlistItem.findMany.mockResolvedValue([]);
});

describe('statsService.getSidebarCounts (#212)', () => {
  it('returns every badge in one call', async () => {
    stock([state(1)], [state(1)]);
    db.product.count.mockResolvedValue(1);
    const counts = await statsService.getSidebarCounts('u1');
    expect(counts).toEqual({
      bottles: 1, cigars: 1, cellars: 2, collections: 3, countSessionActive: false, wishlistReady: 0, remindersToday: 1,
    });
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

// #471 (FEAT-96): the badges count bottles and cigars, not rows. A group of 6
// is 6 bottles, a box of 25 is 25 cigars; a finished or written-off unit is 0.
describe('statsService.getSidebarCounts counts units in stock (#471, FEAT-96)', () => {
  it('groups the units in stock by state, bottles and cigars apart, without reading every row', async () => {
    await statsService.getSidebarCounts('u1');

    expect(db.inventoryItem.groupBy).toHaveBeenCalledTimes(2);
    // #573: finished, trashed and written-off units are out of the scope;
    // FEAT-87 references too.
    expect(db.inventoryItem.groupBy).toHaveBeenCalledWith({
      by: ['quantity', 'isOpened', 'fillLevel', 'cigarsPerBox', 'cigarsLeft'],
      where: { ...IN_STOCK, product: { category: { in: ['wine', 'sparkling', 'spirit'] } } },
      _count: { _all: true },
    });
    expect(db.inventoryItem.groupBy).toHaveBeenCalledWith({
      by: ['quantity', 'isOpened', 'fillLevel', 'cigarsPerBox', 'cigarsLeft'],
      where: { ...IN_STOCK, product: { category: 'cigar' } },
      _count: { _all: true },
    });
  });

  it('adds up 165 bottles and 89 cigars', async () => {
    stock(
      [
        state(2, { quantity: 71 }), // two groups of 71
        state(1, { quantity: 0 }), // an emptied group counts nothing
        state(22), // 22 single bottles
        state(1, { isOpened: true, fillLevel: 30 }),
      ],
      [
        // 3 closed boxes of 25, an opened box of 10 left, 4 single cigars.
        state(1, { quantity: 3, cigarsPerBox: 25 }),
        state(1, { isOpened: true, cigarsPerBox: 25, cigarsLeft: 10 }),
        state(4),
      ],
    );

    const counts = await statsService.getSidebarCounts('u1');

    expect(counts.bottles).toBe(165);
    expect(counts.cigars).toBe(89);
  });
});

// #471: a reminder is about when to drink the wine, so it lives on the family
// (design.md "Où vit une donnée"): one reminder per wine in stock, however many
// bottles it has.
describe('statsService.getSidebarCounts counts reminders per family (#471)', () => {
  it('counts the families in stock whose reminder is due by the end of today, in local time', async () => {
    await statsService.getSidebarCounts('u1');

    expect(db.product.count).toHaveBeenCalledTimes(1);
    const [{ where }] = db.product.count.mock.calls[0];
    expect(where).toEqual({
      deletedAt: null,
      reminderDate: { not: null, lte: expect.any(Date) },
      items: { some: IN_STOCK },
    });
    const expected = new Date();
    expected.setHours(23, 59, 59, 999);
    expect((where.reminderDate.lte as Date).getTime()).toBe(expected.getTime());
  });
});

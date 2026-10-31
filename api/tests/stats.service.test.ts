import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: vi.fn() },
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
  inventoryItem: { findMany: ReturnType<typeof vi.fn> };
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

/** A unit row as the query returns it, with its family nested (#471). */
function unit(category: string, overrides: Record<string, unknown> = {}) {
  return {
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, product: { category }, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.inventoryItem.findMany.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
  db.cellar.count.mockResolvedValue(2);
  db.collection.count.mockResolvedValue(3);
  db.inventoryCountSession.findFirst.mockResolvedValue(null);
  db.wishlistItem.findMany.mockResolvedValue([]);
});

describe('statsService.getSidebarCounts (#212)', () => {
  it('returns every badge in one call', async () => {
    db.inventoryItem.findMany.mockResolvedValue([unit('wine'), unit('cigar')]);
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
  it('reads the units in stock, with their family for bottles vs cigars', async () => {
    await statsService.getSidebarCounts('u1');

    expect(db.inventoryItem.findMany).toHaveBeenCalledTimes(1);
    const [{ where, select }] = db.inventoryItem.findMany.mock.calls[0];
    // #573: finished, trashed and written-off units are out of the scope;
    // FEAT-87 references too.
    expect(where).toEqual(IN_STOCK);
    expect(select).toMatchObject({
      quantity: true, isOpened: true, fillLevel: true, cigarsPerBox: true, cigarsLeft: true, writtenOffAt: true,
      product: { select: { category: true } },
    });
  });

  it('adds up bottles of every bottle category and cigars apart (165 bottles · 89 cigars)', async () => {
    db.inventoryItem.findMany.mockResolvedValue([
      unit('wine', { quantity: 142 }),
      unit('sparkling', { quantity: 0 }), // an emptied group counts nothing
      unit('spirit', { quantity: 22 }),
      unit('spirit', { isOpened: true, fillLevel: 30 }),
      // 3 closed boxes of 25, an opened box of 10 left, 4 single cigars.
      unit('cigar', { quantity: 3, cigarsPerBox: 25 }),
      unit('cigar', { isOpened: true, cigarsPerBox: 25, cigarsLeft: 10 }),
      unit('cigar', { quantity: 4 }),
    ]);

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

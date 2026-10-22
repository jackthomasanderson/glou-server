import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    cellar: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { CellarService } from '../../src/services/cellar.service';

beforeEach(() => {
  vi.clearAllMocks();
  // Batch-array form of $transaction: real Prisma runs every operation and
  // resolves with their results in order — a plain Promise.all over the
  // already-built update promises reproduces that for these tests.
  vi.mocked(prisma.$transaction).mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as never);
});

describe('CellarService.swapSlots (ISSUE_037)', () => {
  it('returns not_found when either item does not exist in this cellar', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'b', slotColumn: 2, slotRow: 1 } as never);

    const res = await CellarService.swapSlots('u1', 'c1', { itemAId: 'a', itemBId: 'b' });
    expect(res).toEqual({ status: 'not_found' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns not_in_grid when either item has no slot assigned', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce({ id: 'a', slotColumn: null, slotRow: null } as never)
      .mockResolvedValueOnce({ id: 'b', slotColumn: 2, slotRow: 1 } as never);

    const res = await CellarService.swapSlots('u1', 'c1', { itemAId: 'a', itemBId: 'b' });
    expect(res).toEqual({ status: 'not_in_grid' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('swaps both items\' slot coordinates inside a single transaction, freeing A\'s slot first (#173)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce({ id: 'a', slotColumn: 1, slotRow: 1 } as never)
      .mockResolvedValueOnce({ id: 'b', slotColumn: 2, slotRow: 1 } as never);
    vi.mocked(prisma.inventoryItem.update)
      .mockResolvedValueOnce({ id: 'a', slotColumn: null, slotRow: null } as never)
      .mockResolvedValueOnce({ id: 'b', slotColumn: 1, slotRow: 1 } as never)
      .mockResolvedValueOnce({ id: 'a', slotColumn: 2, slotRow: 1 } as never);

    const res = await CellarService.swapSlots('u1', 'c1', { itemAId: 'a', itemBId: 'b' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // A's slot (cellarId, slotColumn, slotRow) is now protected by a partial
    // unique index (#173) — moving A straight onto B's still-occupied slot
    // would violate it immediately, so A is freed first, then B moves into
    // A's old (now-free) slot, then A moves into B's old (now-free) slot.
    expect(prisma.inventoryItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { slotColumn: null, slotRow: null },
    });
    expect(prisma.inventoryItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { slotColumn: 1, slotRow: 1 },
    });
    expect(prisma.inventoryItem.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'a' },
      data: { slotColumn: 2, slotRow: 1 },
    });
    expect(res).toEqual({
      status: 'success',
      items: [
        { id: 'a', slotColumn: 2, slotRow: 1 },
        { id: 'b', slotColumn: 1, slotRow: 1 },
      ],
    });
  });

  it('scopes both lookups to the given cellar and excludes soft-deleted items', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    await CellarService.swapSlots('u1', 'c1', { itemAId: 'a', itemBId: 'b' });

    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'a', cellarId: 'c1', deletedAt: null },
    });
    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'b', cellarId: 'c1', deletedAt: null },
    });
  });
});

// ISSUE_239 + #573: a cellar counts and values what it still holds. A
// finished bottle (opened, nothing left) stays in the inventory for its
// history, but is neither counted in `totalItems`/`totalQuantity`, nor valued,
// nor drawn on the map.
describe('CellarService — finished bottles are not in stock (ISSUE_239, #573)', () => {
  /** The in-stock scope, spelled out to pin the SQL shape (lib/finished-item.ts). */
  const IN_STOCK_SCOPE = {
    deletedAt: null,
    isOwned: true,
    // `not: null` keeps an opened bottle with no recorded level in stock.
    NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
  };

  it('listCellars counts and values only the bottles still in stock, in one grouped query', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
      { id: 'c2', name: 'Cave B', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.inventoryItem.groupBy)
      // bottles in stock: count, quantity and valuation in one pass
      .mockResolvedValueOnce([
        { cellarId: 'c1', _count: { id: 5 }, _sum: { quantity: 12, estimatedValue: 300 } },
      ] as never)
      // reminder alerts
      .mockResolvedValueOnce([{ cellarId: 'c1', _count: { id: 2 } }] as never);

    const [caveA, caveB] = await CellarService.listCellars('u1');

    expect(caveA.stats).toEqual({
      totalItems: 5,
      totalQuantity: 12,
      estimatedValue: 300,
      alertCount: 2,
    });
    // A cellar left with only finished bottles has no in-stock group: it reads
    // as empty, not as missing.
    expect(caveB.stats).toEqual({
      totalItems: 0,
      totalQuantity: 0,
      estimatedValue: null,
      alertCount: 0,
    });

    expect(prisma.inventoryItem.groupBy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.inventoryItem.groupBy).mock.calls[0][0]).toEqual({
      by: ['cellarId'],
      where: { cellarId: { in: ['c1', 'c2'] }, ...IN_STOCK_SCOPE },
      _count: { id: true },
      _sum: { quantity: true, estimatedValue: true },
    });
    // Reminders are not about stock: owned items only (FEAT-87), finished or not.
    expect(vi.mocked(prisma.inventoryItem.groupBy).mock.calls[1][0]).toEqual({
      by: ['cellarId'],
      where: {
        cellarId: { in: ['c1', 'c2'] },
        deletedAt: null,
        isOwned: true,
        reminderDate: { lte: expect.any(Date) },
      },
      _count: { id: true },
    });
  });

  it('getCellar applies the same in-stock scope to the single-cellar counts and valuation', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave A' } as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValueOnce({
      _count: { id: 5 },
      _sum: { quantity: 12, estimatedValue: 300 },
    } as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(1 as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats).toEqual({
      totalItems: 5,
      totalQuantity: 12,
      estimatedValue: 300,
      alertCount: 1,
    });

    expect(prisma.inventoryItem.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.aggregate).toHaveBeenCalledWith({
      where: { cellarId: 'c1', ...IN_STOCK_SCOPE },
      _count: { id: true },
      _sum: { quantity: true, estimatedValue: true },
    });
    expect(prisma.inventoryItem.count).toHaveBeenCalledWith({
      where: { cellarId: 'c1', deletedAt: null, isOwned: true, reminderDate: { lte: expect.any(Date) } },
    });
  });

  it('getGridData only places the bottles still in stock on the map', async () => {
    const cave = { id: 'c1', name: 'Cave A' };
    const placed = [{ id: 'a', name: 'Chambertin', slotColumn: 1, slotRow: 1 }];
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue(cave as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(placed as never);

    const grid = await CellarService.getGridData('u1', 'c1');

    expect(grid).toEqual({ cellar: cave, items: placed });
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: 'c1', ...IN_STOCK_SCOPE },
      select: expect.anything(),
      orderBy: { createdAt: 'asc' },
    });
  });
});

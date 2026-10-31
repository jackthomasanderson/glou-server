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
// history, but is neither counted in `bottles`/`cigars`, nor valued,
// nor drawn on the map.
describe('CellarService — finished bottles are not in stock (ISSUE_239, #573)', () => {
  /** The in-stock scope, spelled out to pin the SQL shape (lib/finished-item.ts). */
  const IN_STOCK_SCOPE = {
    deletedAt: null,
    writtenOffAt: null,
    isOwned: true,
    // `not: null` keeps an opened bottle with no recorded level in stock.
    NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
  };

  /** A unit row as the stock query returns it, with its family nested (#471). */
  const unit = (overrides: Record<string, unknown> = {}) => ({
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, cellarId: 'c1', productId: 'p1',
    product: { category: 'wine', reminderDate: null }, ...overrides,
  });

  it('listCellars reads the units in stock of every cellar in one query', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
      { id: 'c2', name: 'Cave B', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 5, estimatedValue: 60 }),
    ] as never);

    const [caveA, caveB] = await CellarService.listCellars('u1');

    expect(caveA.stats).toEqual({ bottles: 5, cigars: 0, totalItems: 5, estimatedValue: 300, alertCount: 0 });
    // A cellar left with only finished bottles has no unit in stock: it reads
    // as empty, not as missing.
    expect(caveB.stats).toEqual({ bottles: 0, cigars: 0, totalItems: 0, estimatedValue: null, alertCount: 0 });

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: { in: ['c1', 'c2'] }, ...IN_STOCK_SCOPE },
      select: expect.objectContaining({
        quantity: true, cigarsPerBox: true, cigarsLeft: true, purchasePrice: true, estimatedValue: true,
        product: { select: { category: true, reminderDate: true } },
      }),
    });
    expect(prisma.inventoryItem.groupBy).not.toHaveBeenCalled();
  });

  it('getCellar applies the same in-stock scope to the single-cellar figures', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave A' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ estimatedValue: 12 })] as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats).toEqual({ bottles: 1, cigars: 0, totalItems: 1, estimatedValue: 12, alertCount: 0 });
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: 'c1', ...IN_STOCK_SCOPE },
      select: expect.any(Object),
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

// #471 (FEAT-96): a cellar counts bottles and cigars, not rows, and values them
// with the analytics' rule (#594: estimated value, else purchase price).
describe('CellarService — bottles, cigars and value (#471, FEAT-96, #594)', () => {
  const unit = (overrides: Record<string, unknown> = {}) => ({
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, cellarId: 'c1', productId: 'p1',
    product: { category: 'wine', reminderDate: null }, ...overrides,
  });

  it('shows 9 bottles worth 215 € for a ×6 at 20 €, a ×2 bought 30 € estimated 40 €, and an opened bottle at 15 € (FEAT-96 c1)', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Garage' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 6, purchasePrice: 20 }),
      unit({ quantity: 2, purchasePrice: 30, estimatedValue: 40 }),
      unit({ isOpened: true, fillLevel: 60, purchasePrice: 15 }),
    ] as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats).toMatchObject({ bottles: 9, totalItems: 9, estimatedValue: 215 });
  });

  it('counts bottles and cigars apart (24 bottles · 50 cigars)', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 24 }),
      unit({ quantity: 2, cigarsPerBox: 25, product: { category: 'cigar', reminderDate: null } }),
    ] as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats).toMatchObject({ bottles: 24, cigars: 50, totalItems: 74 });
  });

  it('counts one reminder per wine (family) due by today, not one per unit', async () => {
    const due = new Date(Date.now() - 86_400_000);
    const later = new Date(Date.now() + 30 * 86_400_000);
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // One wine in three groups, its reminder due: one reminder.
      unit({ productId: 'p1', quantity: 4, product: { category: 'wine', reminderDate: due } }),
      unit({ productId: 'p1', quantity: 2, product: { category: 'wine', reminderDate: due } }),
      unit({ productId: 'p1', isOpened: true, product: { category: 'wine', reminderDate: due } }),
      // Another wine, reminder later this month: none.
      unit({ productId: 'p2', product: { category: 'wine', reminderDate: later } }),
    ] as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats.alertCount).toBe(1);
  });
});

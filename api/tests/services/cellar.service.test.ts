import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findFirst: vi.fn(),
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

// ISSUE_239: a cellar is worth what it still holds. A finished bottle
// (opened, nothing left) keeps its slot and its place in `totalItems`, but
// contributes nothing to `estimatedValue`.
describe('CellarService stats — finished bottles are not valued (ISSUE_239)', () => {
  it('listCellars values only the bottles still held, while counting them all', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.inventoryItem.groupBy)
      // counts: every live row of the cellar
      .mockResolvedValueOnce([{ cellarId: 'c1', _count: { id: 5 }, _sum: { quantity: 12 } }] as never)
      // valuation: the narrower aggregate
      .mockResolvedValueOnce([{ cellarId: 'c1', _sum: { estimatedValue: 300 } }] as never)
      // reminder alerts
      .mockResolvedValueOnce([] as never);

    const [cellar] = await CellarService.listCellars('u1');

    expect(cellar.stats).toEqual({
      totalItems: 5,
      totalQuantity: 12,
      estimatedValue: 300,
      alertCount: 0,
    });

    const valueCall = vi.mocked(prisma.inventoryItem.groupBy).mock.calls[1][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(valueCall.where).toMatchObject({ NOT: { isOpened: true, fillLevel: 0 } });
  });

  it('getCellar applies the same exclusion to the single-cellar valuation', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave A' } as never);
    vi.mocked(prisma.inventoryItem.aggregate)
      .mockResolvedValueOnce({ _count: { id: 5 }, _sum: { quantity: 12 } } as never)
      .mockResolvedValueOnce({ _sum: { estimatedValue: 300 } } as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(1 as never);

    const cellar = await CellarService.getCellar('u1', 'c1');

    expect(cellar?.stats).toEqual({
      totalItems: 5,
      totalQuantity: 12,
      estimatedValue: 300,
      alertCount: 1,
    });

    const valueCall = vi.mocked(prisma.inventoryItem.aggregate).mock.calls[1][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(valueCall.where).toMatchObject({ NOT: { isOpened: true, fillLevel: 0 } });
  });
});

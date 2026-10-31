import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tastingNote: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    inventoryItem: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { tastingsService } from '../../src/services/tastings.service';

type NoteRow = {
  rating: number | null;
  readiness: string | null;
  item: { id: string; name: string; producer: string } | null;
};

/** One rated note per distinct item, ratings decreasing from 5. */
function notes(count: number): NoteRow[] {
  return Array.from({ length: count }, (_, i) => ({
    rating: 5 - i * 0.2,
    readiness: null,
    item: { id: `i${i + 1}`, name: `Item ${i + 1}`, producer: `Producer ${i + 1}` },
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('tastingsService.analytics — top/flop items (ISSUE_038)', () => {
  it('hides the flop list while there are too few rated items', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(1) as never);

    const stats = await tastingsService.analytics('u1');

    expect(stats.topItems.map((i) => i.id)).toEqual(['i1']);
    // The single rated item must not be its own worst entry.
    expect(stats.flopItems).toEqual([]);
  });

  it('still hides the flop list just below the threshold', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(9) as never);

    const stats = await tastingsService.analytics('u1');

    expect(stats.topItems).toHaveLength(5);
    expect(stats.flopItems).toEqual([]);
  });

  it('returns disjoint top and flop lists once there are enough rated items', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(12) as never);

    const stats = await tastingsService.analytics('u1');

    const topIds = stats.topItems.map((i) => i.id);
    const flopIds = stats.flopItems.map((i) => i.id);
    expect(topIds).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
    // Worst first, and never overlapping the top slice.
    expect(flopIds).toEqual(['i12', 'i11', 'i10', 'i9', 'i8']);
    expect(topIds.filter((id) => flopIds.includes(id))).toEqual([]);
  });

  it('ignores unrated notes and notes without an item', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([
      ...notes(2),
      { rating: null, readiness: 'PEAK', item: { id: 'i3', name: 'C', producer: 'P' } },
      { rating: 4, readiness: 'PAST', item: null },
    ] as never);

    const stats = await tastingsService.analytics('u1');

    expect(stats.topItems.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(stats.producerRankings).toHaveLength(2);
    expect(stats.readinessDistribution).toEqual({ TOO_YOUNG: 0, PERFECT: 0, PEAK: 1, PAST: 1 });
  });
});

// #471 (F1 review): a tasting belongs to the family of the bottle tasted, so
// the family's sheet finds it by `productId`.
describe('tastingsService — the family of the tasted bottle', () => {
  it('records the family on a new tasting of a bottle', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b1', productId: 'p1' } as never);

    await tastingsService.create('u1', { itemId: 'b1', rating: 4 });

    expect(vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]).toMatchObject({
      data: { userId: 'u1', itemId: 'b1', productId: 'p1', rating: 4 },
    });
  });

  it('records no family on a tasting without a bottle', async () => {
    await tastingsService.create('u1', { rating: 4 });

    const data = vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.productId).toBeUndefined();
    expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled();
  });

  it('follows the bottle when a tasting is moved to another one', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b2', productId: 'p2' } as never);

    await tastingsService.update('t1', 'u1', { itemId: 'b2' });

    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]).toMatchObject({ data: { itemId: 'b2', productId: 'p2' } });
  });

  it('leaves the family alone when the bottle does not change', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1' } as never);

    await tastingsService.update('t1', 'u1', { rating: 3 });

    const data = vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('productId');
  });
});

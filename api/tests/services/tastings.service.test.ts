import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tastingNote: { findMany: vi.fn() },
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

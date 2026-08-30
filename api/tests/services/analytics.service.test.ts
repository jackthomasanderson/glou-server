import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: vi.fn() },
    cellar: { findMany: vi.fn() },
    auditLog: { groupBy: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { getAnalytics } from '../../src/services/analytics.service';

type ItemRow = {
  category: string;
  estimatedValue: number | null;
  purchasePrice: number | null;
  bottleSize: string | null;
  fillLevel: number | null;
  region: string | null;
  leafOrigin: string | null;
  alertStatus: string | null;
  peakMaturityFrom: number | null;
  peakMaturityTo: number | null;
  cellarId: string | null;
};

function item(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    category: 'wine',
    estimatedValue: null,
    purchasePrice: null,
    bottleSize: '75cl',
    fillLevel: null,
    region: 'Bordeaux',
    leafOrigin: null,
    alertStatus: 'none',
    peakMaturityFrom: null,
    peakMaturityTo: null,
    cellarId: null,
    ...overrides,
  };
}

const thisYear = new Date().getFullYear();

describe('getAnalytics — aggregation invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.auditLog.groupBy).mockResolvedValue([
      { action: 'CREATE', _count: { action: 5 } },
      { action: 'DELETE', _count: { action: 2 } },
    ] as never);
  });

  it('category counts and maturity buckets each sum to the active item total', async () => {
    const items: ItemRow[] = [
      item({ category: 'wine', estimatedValue: 100, alertStatus: 'none' }),
      item({ category: 'wine', purchasePrice: 40, alertStatus: 'approaching' }),
      item({ category: 'spirit', estimatedValue: 60, alertStatus: 'peak', region: 'Speyside' }),
      item({ category: 'cigar', estimatedValue: 20, alertStatus: 'past', region: null, leafOrigin: 'Cuba' }),
    ];
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(items as never);

    const stats = await getAnalytics();

    expect(stats.totalActiveItems).toBe(4);
    expect(stats.categoryBreakdown.reduce((s, c) => s + c.count, 0)).toBe(4);

    const m = stats.maturityPlanning;
    expect(m.readyNow.count + m.preserve.count + m.atPeak.count + m.pastPeak.count).toBe(4);
    expect(m.readyNow.count).toBe(1);
    expect(m.preserve.count).toBe(1);
    expect(m.atPeak.count).toBe(1);
    expect(m.pastPeak.count).toBe(1);

    // valuation falls back estimatedValue -> purchasePrice -> 0
    expect(stats.totalValuation).toBe(220);
    expect(stats.cigarModulesCount).toBe(1);
    expect(stats.urgentDegustationCount).toBe(2); // peak + past
  });

  it('regionBreakdown is capped at 10, sorted by count desc, and uses leafOrigin for cigars', async () => {
    const items: ItemRow[] = [];
    for (let i = 0; i < 12; i++) {
      const n = i + 1;
      for (let k = 0; k < n; k++) items.push(item({ region: `Region ${n}`, estimatedValue: 1 }));
    }
    items.push(item({ category: 'cigar', region: null, leafOrigin: 'Cuba', estimatedValue: 1 }));
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(items as never);

    const stats = await getAnalytics();

    expect(stats.regionBreakdown.length).toBe(10);
    for (let i = 1; i < stats.regionBreakdown.length; i++) {
      expect(stats.regionBreakdown[i - 1].count).toBeGreaterThanOrEqual(stats.regionBreakdown[i].count);
    }
    expect(stats.regionCategoryBreakdown.some((r) => r.region === 'Cuba' && r.category === 'cigar')).toBe(true);
  });

  it('garde histogram is sorted by year and clamped to [-3y, +20y] around now', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ peakMaturityFrom: 1990, peakMaturityTo: 2100 }), // very wide → gets clamped
      item({ peakMaturityFrom: thisYear, peakMaturityTo: thisYear + 1 }),
    ] as never);

    const stats = await getAnalytics();
    const years = stats.gardeHistogram.map((p) => p.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(Math.min(...years)).toBeGreaterThanOrEqual(thisYear - 3);
    expect(Math.max(...years)).toBeLessThanOrEqual(thisYear + 20);
  });

  it('maps audit groupBy rows onto movement counters', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const stats = await getAnalytics();
    expect(stats.movements).toEqual({ added: 5, consumed: 2, restored: 0 });
    // Empty inventory → every percentage is 0, not NaN
    expect(stats.maturityPlanning.readyNow.percent).toBe(0);
  });

  it('threads the date range into the audit-movement query only', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const from = new Date('2026-01-01');
    const to = new Date('2026-06-30');
    await getAnalytics(from, to);
    const call = vi.mocked(prisma.auditLog.groupBy).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(call.where.createdAt).toEqual({ gte: from, lte: to });
  });
});

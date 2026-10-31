import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: vi.fn(), count: vi.fn() },
    cellar: { findMany: vi.fn() },
    auditLog: { groupBy: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { getAnalytics } from '../../src/services/analytics.service';
import { ANALYTICS_PERIOD_SCOPE } from '../../../shared/analytics';

type ItemRow = {
  quantity: number | null;
  isOpened: boolean;
  fillLevel: number | null;
  cigarsPerBox: number | null;
  cigarsLeft: number | null;
  writtenOffAt: Date | null;
  estimatedValue: number | null;
  purchasePrice: number | null;
  bottleSize: string | null;
  cellarId: string | null;
  product: {
    category: string;
    region: string | null;
    leafOrigin: string | null;
    alertStatus: string | null;
    peakMaturityFrom: number | null;
    peakMaturityTo: number | null;
    curveShape: string | null;
  };
};

type Flat = Omit<ItemRow, 'product'> & ItemRow['product'];

/** A unit row with its family nested (#471), built from flat overrides. */
function item(overrides: Partial<Flat> = {}): ItemRow {
  const flat: Flat = {
    quantity: 1,
    isOpened: false,
    fillLevel: null,
    cigarsPerBox: null,
    cigarsLeft: null,
    writtenOffAt: null,
    estimatedValue: null,
    purchasePrice: null,
    bottleSize: '75cl',
    cellarId: null,
    category: 'wine',
    region: 'Bordeaux',
    leafOrigin: null,
    alertStatus: 'none',
    peakMaturityFrom: null,
    peakMaturityTo: null,
    curveShape: null,
    ...overrides,
  };
  const { category, region, leafOrigin, alertStatus, peakMaturityFrom, peakMaturityTo, curveShape, ...unit } = flat;
  return { ...unit, product: { category, region, leafOrigin, alertStatus, peakMaturityFrom, peakMaturityTo, curveShape } };
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
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(3 as never);
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
    expect(m.noWindow.count + m.preserve.count + m.atPeak.count + m.pastPeak.count).toBe(4);
    // ISSUE_100: alertStatus 'none' (no peak-maturity window) is its own
    // bucket, distinct from — and no longer folded into — a "ready now" claim.
    expect(m.noWindow.count).toBe(1);
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

  it('maps audit groupBy rows onto movement counters, consumed coming from item state', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const stats = await getAnalytics();
    // ISSUE_040: `consumed` counts finished bottles (isOpened + fillLevel 0),
    // NOT the DELETE audit rows, which are reported separately as `deleted`.
    expect(stats.movements).toEqual({ added: 5, consumed: 3, deleted: 2, restored: 0 });
    const countCall = vi.mocked(prisma.inventoryItem.count).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(countCall.where).toMatchObject({ deletedAt: null, isOpened: true, fillLevel: 0 });
    // Empty inventory → every percentage is 0, not NaN
    expect(stats.maturityPlanning.noWindow.percent).toBe(0);
  });

  it('threads the date range into the audit-movement query only', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const from = new Date('2026-01-01');
    const to = new Date('2026-06-30');
    await getAnalytics(from, to);
    const call = vi.mocked(prisma.auditLog.groupBy).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(call.where.createdAt).toEqual({ gte: from, lte: to });
    // The consumed counter is dated by the item's own updatedAt stamp.
    const countCall = vi.mocked(prisma.inventoryItem.count).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(countCall.where.updatedAt).toEqual({ gte: from, lte: to });
    // ...and the inventory aggregate query itself stays unfiltered (beyond
    // the owned-items scope FEAT-87 applies everywhere in this function).
    const findCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(findCall.where).toEqual({ deletedAt: null, isOwned: true });
  });

  // ISSUE_035/ISSUE_104: the payload states which part of itself the range
  // filters, so the UI never presents the period as a page-wide filter.
  it('echoes the applied range and its movements-only scope', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-06-30T00:00:00.000Z');

    const bounded = await getAnalytics(from, to);
    expect(bounded.period).toEqual({
      from: from.toISOString(),
      to: to.toISOString(),
      scope: ANALYTICS_PERIOD_SCOPE,
    });
    expect(ANALYTICS_PERIOD_SCOPE).toBe('movements');

    const unbounded = await getAnalytics();
    expect(unbounded.period).toEqual({ from: null, to: null, scope: ANALYTICS_PERIOD_SCOPE });
  });
});

// ISSUE_239: a finished bottle (opened, nothing left) is no longer an asset.
// The criterion is the app-wide one — see api/src/lib/finished-item.ts.
describe('getAnalytics — finished bottles are not valued', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.auditLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(0 as never);
  });

  it('excludes a finished bottle from the collection valuation', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ estimatedValue: 100 }),
      item({ estimatedValue: 40, isOpened: true, fillLevel: 0 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalValuation).toBe(100);
  });

  it('still values a bottle that is opened but not empty', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ estimatedValue: 40, isOpened: true, fillLevel: 40 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalValuation).toBe(40);
  });

  it('keeps the finished bottle in the money actually spent, not in the counts (#471)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ purchasePrice: 25, isOpened: true, fillLevel: 0 }),
    ] as never);

    const stats = await getAnalytics();

    // Its purchase is still part of the spending history (budget.service.ts
    // semantics), but it is no longer a bottle in the cellar (FEAT-96).
    expect(stats.totalActiveItems).toBe(0);
    expect(stats.totalPurchasePrice).toBe(25);
    expect(stats.totalValuation).toBe(0);
  });

  it('drops the finished bottle from the per-category, per-region and per-cellar valuations', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ category: 'wine', region: 'Bordeaux', cellarId: 'c1', estimatedValue: 100 }),
      item({ category: 'wine', region: 'Bordeaux', cellarId: 'c1', estimatedValue: 40, isOpened: true, fillLevel: 0 }),
    ] as never);

    const stats = await getAnalytics();

    const wine = stats.categoryBreakdown.find((c) => c.category === 'wine');
    expect(wine).toMatchObject({ count: 1, valuation: 100 });
    expect(stats.regionBreakdown.find((r) => r.region === 'Bordeaux')).toMatchObject({ count: 1, valuation: 100 });
    expect(stats.caveDistribution.find((c) => c.cellarId === 'c1')).toMatchObject({ count: 1, valuation: 100 });
  });
});

// #573: a finished bottle has been drunk. It stays an inventory row (in the
// spending — see above), but it no longer calls for a tasting, has no place in
// the maturity planning and no ageing ahead.
describe('getAnalytics — finished bottles are out of the maturity planning (#573)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.auditLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(0 as never);
  });

  it('counts a finished bottle at its peak nowhere: not as a bottle, urgent, in a maturity bucket or in the garde histogram', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // Finished, and its window is open right now.
      item({
        category: 'wine',
        cellarId: 'c1',
        estimatedValue: 80,
        alertStatus: 'peak',
        peakMaturityFrom: thisYear,
        peakMaturityTo: thisYear + 2,
        isOpened: true,
        fillLevel: 0,
      }),
      // In stock, no window.
      item({ category: 'wine', cellarId: 'c1', estimatedValue: 50, alertStatus: 'none' }),
      // In stock, still ageing.
      item({
        category: 'spirit',
        estimatedValue: 30,
        alertStatus: 'approaching',
        peakMaturityFrom: thisYear + 10,
        peakMaturityTo: thisYear + 10,
      }),
    ] as never);

    const stats = await getAnalytics();

    // #471 (FEAT-96): no longer a bottle in the cellar, and valued at nothing.
    expect(stats.totalActiveItems).toBe(2);
    expect(stats.categoryBreakdown.find((c) => c.category === 'wine')).toMatchObject({ count: 1, valuation: 50 });
    expect(stats.caveDistribution.find((c) => c.cellarId === 'c1')).toMatchObject({ count: 1, valuation: 50 });

    // But nothing left to drink or to age.
    expect(stats.urgentDegustationCount).toBe(0);
    // The buckets split the two bottles in stock, so the percents are over 2
    // (not over the 3 rows) and add up to 100.
    expect(stats.maturityPlanning).toEqual({
      preserve: { count: 1, percent: 50 },
      atPeak: { count: 0, percent: 0 },
      pastPeak: { count: 0, percent: 0 },
      noWindow: { count: 1, percent: 50 },
    });
    expect(stats.gardeHistogram).toEqual([{ year: thisYear + 10, count: 1 }]);
  });

  it('keeps an opened bottle whose fill level was never entered in the maturity planning', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ alertStatus: 'peak', peakMaturityFrom: thisYear, peakMaturityTo: thisYear, isOpened: true, fillLevel: null }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.urgentDegustationCount).toBe(1);
    expect(stats.maturityPlanning.atPeak).toEqual({ count: 1, percent: 100 });
    expect(stats.gardeHistogram).toEqual([{ year: thisYear, count: 1 }]);
  });
});

// FEAT-87: analytics describe what the instance holds. A non-owned reference
// is out of every figure, counts included — so it is excluded in SQL rather
// than zeroed out in the loop.
describe('getAnalytics excludes non-owned references (FEAT-87)', () => {
  it('restricts the inventory and consumed-count queries to owned items', async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAnalytics();

    const itemsCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(itemsCall.where).toMatchObject({ deletedAt: null, isOwned: true });

    const consumedCall = vi.mocked(prisma.inventoryItem.count).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(consumedCall.where).toMatchObject({ deletedAt: null, isOwned: true });
  });
});

// #471 (FEAT-96): a row is a group of N copies. Every figure counts units in
// stock — bottles, or cigars — and values them with `itemValue` (#594).
describe('getAnalytics — units, value and spending of groups (#471, FEAT-96)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([{ id: 'c1', name: 'Garage', type: 'VINTAGE' }] as never);
    vi.mocked(prisma.auditLog.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(0 as never);
  });

  it('reads the units\' state and their family\'s description', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAnalytics();

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { select: Record<string, unknown> };
    expect(call.select).toMatchObject({
      quantity: true, cigarsPerBox: true, cigarsLeft: true, writtenOffAt: true,
      product: { select: expect.objectContaining({ category: true, region: true, alertStatus: true }) },
    });
  });

  it('shows 9 bottles worth 215 € in the cellar, like its card (FEAT-96 c1)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ cellarId: 'c1', quantity: 6, purchasePrice: 20 }),
      item({ cellarId: 'c1', quantity: 2, purchasePrice: 30, estimatedValue: 40 }),
      item({ cellarId: 'c1', isOpened: true, fillLevel: 60, purchasePrice: 15 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalActiveItems).toBe(9);
    expect(stats.totalValuation).toBe(215);
    expect(stats.caveDistribution).toEqual([
      { cellarId: 'c1', cellarName: 'Garage', cellarType: 'VINTAGE', count: 9, valuation: 215 },
    ]);
    expect(stats.categoryBreakdown).toEqual([{ category: 'wine', count: 9, valuation: 215 }]);
    expect(stats.regionBreakdown).toEqual([{ region: 'Bordeaux', count: 9, valuation: 215 }]);
    // 8 full bottles of 0.75 l, plus one at 60 %.
    expect(stats.totalLiquidLiters).toBe(6.45);
  });

  it('counts cigars in cigars: 3 boxes of 25, an opened box of 10, 4 single ones (89)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ category: 'cigar', quantity: 3, cigarsPerBox: 25, purchasePrice: 200 }),
      item({ category: 'cigar', isOpened: true, cigarsPerBox: 25, cigarsLeft: 10, purchasePrice: 200 }),
      item({ category: 'cigar', quantity: 4, purchasePrice: 9 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.cigarModulesCount).toBe(89);
    expect(stats.categoryBreakdown).toEqual([{ category: 'cigar', count: 89, valuation: 836 }]);
    expect(stats.totalLiquidLiters).toBe(0);
  });

  it('keeps drunk and written-off copies in the spending, out of the counts and the value', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 4, purchasePrice: 20 }),
      item({ purchasePrice: 20, isOpened: true, fillLevel: 0 }),
      item({ purchasePrice: 20, writtenOffAt: new Date('2026-02-01') }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalActiveItems).toBe(4);
    expect(stats.totalValuation).toBe(80);
    expect(stats.totalPurchasePrice).toBe(120);
  });

  it('splits the maturity planning and the garde histogram by bottles, not by rows', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 3, alertStatus: 'peak', peakMaturityFrom: thisYear, peakMaturityTo: thisYear }),
      item({ alertStatus: 'none' }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.urgentDegustationCount).toBe(3);
    expect(stats.maturityPlanning.atPeak).toEqual({ count: 3, percent: 75 });
    expect(stats.maturityPlanning.noWindow).toEqual({ count: 1, percent: 25 });
    expect(stats.gardeHistogram).toEqual([{ year: thisYear, count: 3 }]);
  });
});

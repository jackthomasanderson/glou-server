import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: { findMany: vi.fn() },
    cellar: { findMany: vi.fn() },
    stockMovement: { groupBy: vi.fn() },
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
  updatedAt: Date;
  finishedAt: Date | null;
  product: {
    category: string;
    region: string | null;
    appellation: string | null;
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
    updatedAt: new Date(),
    finishedAt: null,
    category: 'wine',
    region: 'Bordeaux',
    appellation: null,
    leafOrigin: null,
    alertStatus: 'none',
    peakMaturityFrom: null,
    peakMaturityTo: null,
    curveShape: null,
    ...overrides,
  };
  const { category, region, appellation, leafOrigin, alertStatus, peakMaturityFrom, peakMaturityTo, curveShape, ...unit } = flat;
  return { ...unit, product: { category, region, appellation, leafOrigin, alertStatus, peakMaturityFrom, peakMaturityTo, curveShape } };
}

const thisYear = new Date().getFullYear();

describe('getAnalytics — aggregation invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([
      // #848: bottles added and trashed, read from the movement journal.
      { kind: 'ADDED', _sum: { delta: 5 } },
      { kind: 'TRASHED', _sum: { delta: -2 } },
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
    expect(m.noWindow.count + m.preserve.count + m.atPeak.count + m.pastPeak.count).toBe(4);
    // ISSUE_100: alertStatus 'none' (no peak-maturity window) is its own
    // bucket, distinct from — and no longer folded into — a "ready now" claim.
    expect(m.noWindow.count).toBe(1);
    expect(m.preserve.count).toBe(1);
    expect(m.atPeak.count).toBe(1);
    expect(m.pastPeak.count).toBe(1);

    // valuation falls back estimatedValue -> purchasePrice -> 0
    expect(stats.totalValuation).toBe(220);
    expect(stats.cigarCount).toBe(1);
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

  it('maps the journal\'s movements onto the counters, consumed coming from item state (#848)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ isOpened: true, fillLevel: 0 }),
      item({ isOpened: true, fillLevel: 0 }),
      item({ isOpened: true, fillLevel: 0 }),
    ] as never);
    const stats = await getAnalytics();
    // ISSUE_040: `consumed` counts finished bottles (isOpened + fillLevel 0),
    // NOT the DELETE audit rows, which are reported separately as `deleted`.
    expect(stats.movements).toEqual({ added: 5, consumed: 3, deleted: 2, restored: 0 });
    // Nothing in stock → every percentage is 0, not NaN
    expect(stats.maturityPlanning.noWindow.percent).toBe(0);
  });

  it('threads the date range into the journal query only', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    const from = new Date('2026-01-01');
    const to = new Date('2026-06-30');
    await getAnalytics(from, to);
    const call = vi.mocked(prisma.stockMovement.groupBy).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(call.where.createdAt).toEqual({ gte: from, lte: to });
    // The consumed counter is dated by the item's own finishedAt stamp (#589
    // case below); the inventory aggregate query itself stays unfiltered (beyond
    // the owned-items scope FEAT-87 applies everywhere in this function).
    const findCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(findCall.where).toEqual({ deletedAt: null });
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
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
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

  it('values an opened box by its cigars left, the spending unchanged (recette #471)', async () => {
    // 2 boxes of 25 at 200 €, 2 cigars smoked out of one: 200 + 200 × 23/25.
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ category: 'cigar', cellarId: 'c1', cigarsPerBox: 25, purchasePrice: 200 }),
      item({ category: 'cigar', cellarId: 'c1', cigarsPerBox: 25, cigarsLeft: 23, isOpened: true, purchasePrice: 200 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalValuation).toBe(384);
    expect(stats.totalPurchasePrice).toBe(400);
    expect(stats.categoryBreakdown.find((c) => c.category === 'cigar')).toMatchObject({ count: 48, valuation: 384 });
    expect(stats.caveDistribution.find((c) => c.cellarId === 'c1')).toMatchObject({ count: 48, valuation: 384 });
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
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
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
  it('restricts the inventory query, consumed units included, to owned items', async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAnalytics();

    const itemsCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(itemsCall.where).toMatchObject({ deletedAt: null });
  });
});

// #471 (FEAT-96): a row is a group of N copies. Every figure counts units in
// stock — bottles, or cigars — and values them with `itemValue` (#594).
describe('getAnalytics — units, value and spending of groups (#471, FEAT-96)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([{ id: 'c1', name: 'Garage', type: 'VINTAGE' }] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
  });

  it('reads the units\' state and their family\'s description', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAnalytics();

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { select: Record<string, unknown> };
    expect(call.select).toMatchObject({
      quantity: true, cigarsPerBox: true, cigarsLeft: true, writtenOffAt: true,
      product: { select: expect.objectContaining({ category: true, region: true, appellation: true, alertStatus: true }) },
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

  it('counts the bottles in no cellar under their own entry, so the distribution sums to the stock (recette #847, KO 10.2)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ cellarId: 'c1', quantity: 104, purchasePrice: 10 }),
      item({ cellarId: null, quantity: 1, purchasePrice: 30 }),
      // Drunk, in no cellar: no unit in stock, never an entry of its own.
      item({ cellarId: null, isOpened: true, fillLevel: 0, purchasePrice: 99 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.totalActiveItems).toBe(105);
    expect(stats.caveDistribution).toEqual([
      { cellarId: 'c1', cellarName: 'Garage', cellarType: 'VINTAGE', count: 104, valuation: 1040 },
      { cellarId: null, cellarName: '', cellarType: 'VINTAGE', count: 1, valuation: 30 },
    ]);
    expect(stats.caveDistribution.reduce((sum, cave) => sum + cave.count, 0)).toBe(stats.totalActiveItems);
    expect(stats.caveDistribution.reduce((sum, cave) => sum + cave.valuation, 0)).toBe(stats.totalValuation);
  });

  it('counts cigars in cigars: 3 boxes of 25, an opened box of 10, 4 single ones (89), the opened box worth its 10/25', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ category: 'cigar', quantity: 3, cigarsPerBox: 25, purchasePrice: 200 }),
      item({ category: 'cigar', isOpened: true, cigarsPerBox: 25, cigarsLeft: 10, purchasePrice: 200 }),
      item({ category: 'cigar', quantity: 4, purchasePrice: 9 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.cigarCount).toBe(89);
    expect(stats.categoryBreakdown).toEqual([{ category: 'cigar', count: 89, valuation: 716 }]);
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

// #838: "Consumed" counts units (each bottle drunk, each cigar smoked), and the
// capital gain compares the value and the purchase cost of the same units:
// those in stock. What was spent overall stays its own figure.
describe('getAnalytics — consumed units and the capital gain (#838)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
  });

  it('counts each cigar smoked, not each box finished', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // 2 closed boxes: nothing smoked.
      item({ category: 'cigar', quantity: 2, cigarsPerBox: 25, purchasePrice: 200 }),
      // 2 cigars smoked out of an opened box.
      item({ category: 'cigar', isOpened: true, cigarsPerBox: 25, cigarsLeft: 23, purchasePrice: 200 }),
      // A box smoked to its last cigar: 25, not 1.
      item({ category: 'cigar', isOpened: true, fillLevel: 0, cigarsPerBox: 25, cigarsLeft: 0, purchasePrice: 200 }),
      // A single cigar smoked.
      item({ category: 'cigar', isOpened: true, fillLevel: 0, purchasePrice: 9 }),
      // A box given away is not smoked.
      item({ category: 'cigar', cigarsPerBox: 25, writtenOffAt: new Date('2026-02-01'), purchasePrice: 200 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.movements.consumed).toBe(28);
  });

  it('counts a family with drunk bottles in bottles: 2 drunk, the opened one and the broken one not', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 3, purchasePrice: 20 }),
      item({ isOpened: true, fillLevel: 0, purchasePrice: 20 }),
      item({ isOpened: true, fillLevel: 0, purchasePrice: 20 }),
      item({ isOpened: true, fillLevel: 40, purchasePrice: 20 }),
      item({ writtenOffAt: new Date('2026-02-01'), purchasePrice: 20 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.movements.consumed).toBe(2);
  });

  // #589: a finished unit is dated by when it was finished, never by its
  // last write (a move, a count, an edit months later). An opened box's
  // cigars are still dated by its last write until movements are logged (#848).
  it('dates finished units by when they were finished, within the period only', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ isOpened: true, fillLevel: 0, finishedAt: new Date('2026-03-10'), updatedAt: new Date('2026-11-02') }),
      item({ isOpened: true, fillLevel: 0, finishedAt: new Date('2025-12-31'), updatedAt: new Date('2026-05-02') }),
      item({ category: 'cigar', isOpened: true, cigarsPerBox: 20, cigarsLeft: 15, updatedAt: new Date('2026-04-01') }),
      item({ quantity: 6, purchasePrice: 10, updatedAt: new Date('2024-01-01') }),
    ] as never);

    const stats = await getAnalytics(new Date('2026-01-01'), new Date('2026-06-30'));

    expect(stats.movements.consumed).toBe(6);
    // The rest of the page still describes the cellar as it stands.
    expect(stats.totalActiveItems).toBe(6 + 15);
  });

  it('a bottle finished in March and moved in November counts in March, not in November (#589)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ isOpened: true, fillLevel: 0, finishedAt: new Date('2026-03-10'), updatedAt: new Date('2026-11-02') }),
    ] as never);

    const march = await getAnalytics(new Date('2026-03-01'), new Date('2026-03-31'));
    const november = await getAnalytics(new Date('2026-11-01'), new Date('2026-11-30'));

    expect(march.movements.consumed).toBe(1);
    expect(november.movements.consumed).toBe(0);
  });

  it('reads when each unit was finished', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAnalytics();

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as { select: Record<string, unknown> };
    expect(call.select).toMatchObject({ finishedAt: true });
  });

  it('compares value and cost of the bottles in stock: drinking a bottle that kept its price leaves the gain at 0', async () => {
    const family = [item({ quantity: 6, purchasePrice: 20 })];
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(family as never);
    const before = await getAnalytics();

    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 4, purchasePrice: 20 }),
      item({ isOpened: true, fillLevel: 0, purchasePrice: 20 }),
      item({ writtenOffAt: new Date('2026-02-01'), purchasePrice: 20 }),
    ] as never);
    const after = await getAnalytics();

    expect(before.totalValuation - before.inStockPurchasePrice).toBe(0);
    expect(after.inStockPurchasePrice).toBe(80);
    expect(after.totalValuation).toBe(80);
    expect(after.totalValuation - after.inStockPurchasePrice).toBe(0);
    // What was spent was spent: the drunk and the broken bottle included.
    expect(after.totalPurchasePrice).toBe(120);
  });

  it('costs an opened box by its cigars left, like its value', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ category: 'cigar', isOpened: true, cigarsPerBox: 25, cigarsLeft: 23, purchasePrice: 200, estimatedValue: 250 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.inStockPurchasePrice).toBe(184);
    expect(stats.totalValuation).toBe(230);
    expect(stats.totalPurchasePrice).toBe(200);
  });
});

// #702: a bottle with no price counts 0 € in the value; the KPI must say so.
describe('getAnalytics — units in stock with no price (#702)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
  });

  it('counts the units in stock with neither an estimated value nor a purchase price, a group by its bottles', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 6 }),
      item({ quantity: 2, purchasePrice: 20 }),
      item({ quantity: 1, estimatedValue: 40 }),
      // Drunk: no longer in stock, not "unpriced".
      item({ quantity: 1, isOpened: true, fillLevel: 0 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.unpricedUnits).toBe(6);
    expect(stats.totalActiveItems).toBe(9);
  });

  it('tells the cigars with no price apart, so the KPI names them (review of #1014)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ quantity: 6 }),
      item({ category: 'cigar', quantity: 2, cigarsPerBox: 25 }),
      item({ category: 'cigar', quantity: 3, purchasePrice: 12 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.unpricedUnits).toBe(56);
    expect(stats.unpricedCigars).toBe(50);
  });

  it('is 0 when every unit in stock has a price', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([item({ quantity: 3, purchasePrice: 10 })] as never);
    expect((await getAnalytics()).unpricedUnits).toBe(0);
  });
});

describe('getAnalytics — where the world map places the bottles (#961)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stockMovement.groupBy).mockResolvedValue([] as never);
  });

  it('counts a bottle with only an appellation under that appellation', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ region: null, appellation: 'Pomerol', quantity: 2, estimatedValue: 30 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.regionCategoryBreakdown).toEqual([{ region: 'Pomerol', category: 'wine', count: 2, valuation: 60 }]);
    expect(stats.noLocationBreakdown).toEqual([]);
  });

  it('keeps the region as the reference: an unknown region is not replaced by a known appellation', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ region: 'Terroir Imaginaire', appellation: 'Pomerol' }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.regionCategoryBreakdown.map((r) => r.region)).toEqual(['Terroir Imaginaire']);
  });

  it('counts the bottles in stock with neither a region nor a placeable appellation as not located, per category', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ region: null, appellation: null, quantity: 3 }),
      item({ region: '  ', appellation: 'Cuvée Imaginaire', quantity: 1 }),
      item({ category: 'spirit', region: null, quantity: 1 }),
      // Finished: not on the map, not counted as missing from it either.
      item({ region: null, isOpened: true, fillLevel: 0 }),
      item({ region: 'Bordeaux' }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.noLocationBreakdown).toEqual([
      { category: 'wine', count: 4 },
      { category: 'spirit', count: 1 },
    ]);
    expect(stats.regionCategoryBreakdown).toEqual([{ region: 'Bordeaux', category: 'wine', count: 1, valuation: 0 }]);
  });

  it('groups the spellings of a region regardless of case, spaces and accents, under the name the map knows', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ region: 'bordeaux ', quantity: 1 }),
      item({ region: 'Bordeaux', quantity: 1 }),
      item({ region: 'vallee du rhone', quantity: 1 }),
      item({ region: 'nouvelle aquitaine', quantity: 6 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.regionCategoryBreakdown).toEqual([
      { region: 'Nouvelle-Aquitaine', category: 'wine', count: 6, valuation: 0 },
      { region: 'Bordeaux', category: 'wine', count: 2, valuation: 0 },
      { region: 'Vallée du Rhône', category: 'wine', count: 1, valuation: 0 },
    ]);
    expect(stats.regionBreakdown.map((r) => [r.region, r.count])).toEqual([
      ['Nouvelle-Aquitaine', 6], ['Bordeaux', 2], ['Vallée du Rhône', 1],
    ]);
  });

  it('shows an unknown region under its most frequent spelling', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ region: 'Terroir Imaginaire', quantity: 1 }),
      item({ region: 'terroir imaginaire ', quantity: 3 }),
    ] as never);

    const stats = await getAnalytics();

    expect(stats.regionCategoryBreakdown).toEqual([
      { region: 'terroir imaginaire', category: 'wine', count: 4, valuation: 0 },
    ]);
  });
});

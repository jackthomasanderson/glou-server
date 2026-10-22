import { prisma } from '../lib/prisma';
import { CurveShape, readinessIndex } from '../lib/maturity-curve';
import { FINISHED_ITEM_STATE, isFinishedItem } from '../lib/finished-item';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { ANALYTICS_PERIOD_SCOPE, type AnalyticsStats, type CavePoint, type MovementStats } from '../../../shared/analytics';

function computeBottleVolume(category: string, bottleSize: string | null, fillLevel: number | null): number {
  if (category === 'cigar') return 0;

  const size = (bottleSize ?? '').toLowerCase();
  let baseVolume: number;

  if (size.includes('magnum') || size.includes('1.5')) {
    baseVolume = 1.5;
  } else if (size.includes('jeroboam') || size.includes('jéroboam') || size.includes('3l')) {
    baseVolume = 3.0;
  } else if (size.includes('37') || size.includes('demi')) {
    baseVolume = 0.375;
  } else if (category === 'spirit') {
    baseVolume = 0.7;
  } else {
    baseVolume = 0.75;
  }

  const fill = fillLevel != null ? fillLevel / 100 : 1;
  return Math.round(baseVolume * fill * 1000) / 1000;
}

// Analytics cover the instance's entire shared inventory (design.md
// invariant: userId is an audit field, not an access filter) — every member
// sees the same aggregate stats, not just the items/cellars/movements they
// personally created.
export async function getAnalytics(from?: Date, to?: Date): Promise<AnalyticsStats> {
  const dateFilter = from || to
    ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  // "Consumed" is a state of the item itself, not an audit action, so it is
  // dated by `updatedAt` (every write stamps it) rather than by the audit
  // log's `createdAt`.
  const consumedDateFilter = from || to
    ? { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  // ISSUE_035/ISSUE_104: deliberately not spread into the inventory query
  // (ANALYTICS_PERIOD_SCOPE, shared/analytics.ts). Inventory aggregates
  // describe the cellar as it stands right now — a bottle bought in 2019 is
  // still in the cellar today, so leaving it out of the valuation would mislead.
  const [items, cellars, auditMovements, consumedCount] = await Promise.all([
    prisma.inventoryItem.findMany({
      // FEAT-87: analytics describe what the instance holds, so non-owned
      // references are out of every figure here — valuation and counts alike.
      where: { deletedAt: null, ...OWNED_ITEM_FILTER },
      select: {
        category: true,
        estimatedValue: true,
        purchasePrice: true,
        bottleSize: true,
        fillLevel: true,
        isOpened: true,
        region: true,
        leafOrigin: true,
        alertStatus: true,
        peakMaturityFrom: true,
        peakMaturityTo: true,
        curveShape: true,
        cellarId: true,
      },
    }),
    prisma.cellar.findMany({
      select: { id: true, name: true, type: true },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        action: { in: ['CREATE', 'DELETE', 'RESTORE'] },
        status: 'success',
        ...dateFilter,
      },
      _count: { action: true },
    }),
    // Bottles finished during the period — the app-wide "consumed" criterion,
    // shared with consumption-plan.service and inventory-count.service (see
    // lib/finished-item.ts).
    prisma.inventoryItem.count({
      where: {
        deletedAt: null,
        ...OWNED_ITEM_FILTER,
        ...FINISHED_ITEM_STATE,
        ...consumedDateFilter,
      },
    }),
  ]);

  let totalValuation = 0;
  let totalPurchasePrice = 0;
  let totalLiquidLiters = 0;
  let cigarModulesCount = 0;
  let urgentDegustationCount = 0;
  let noWindow = 0;
  let preserve = 0;
  let atPeak = 0;
  let pastPeak = 0;
  let inStockCount = 0;

  const categoryMap: Record<string, { count: number; valuation: number }> = {};
  const regionMap: Record<string, { count: number; valuation: number }> = {};
  // FEAT-40/41: region × category composite map, built alongside regionMap
  // from the same loop/values — no second pass over `items`.
  const regionCategoryMap: Record<string, Record<string, { count: number; valuation: number }>> = {};
  const caveMap: Record<string, { count: number; valuation: number }> = {};
  const currentYear = new Date().getFullYear();
  const gardeMap: Record<number, number> = {};
  const GARDE_HORIZON_PAST = 3;
  const GARDE_HORIZON_FUTURE = 20;

  for (const item of items) {
    // ISSUE_239: a finished bottle (opened, nothing left) is no longer an
    // asset — it holds no remaining value, so it contributes 0 to every
    // valuation below (global, per category, per region, per cellar). It
    // still counts as an inventory row, and `totalPurchasePrice` still
    // includes it: what was spent was spent, consistent with
    // budget.service.ts.
    const value = isFinishedItem(item) ? 0 : (item.estimatedValue ?? item.purchasePrice ?? 0);
    totalValuation += value;
    totalPurchasePrice += item.purchasePrice ?? 0;
    totalLiquidLiters += computeBottleVolume(item.category, item.bottleSize, item.fillLevel);

    if (item.category === 'cigar') cigarModulesCount += 1;

    if (!categoryMap[item.category]) categoryMap[item.category] = { count: 0, valuation: 0 };
    categoryMap[item.category].count += 1;
    categoryMap[item.category].valuation += value;

    const region = item.category === 'cigar'
      ? (item.leafOrigin ?? item.region)
      : item.region;
    if (region?.trim()) {
      const key = region.trim();
      if (!regionMap[key]) regionMap[key] = { count: 0, valuation: 0 };
      regionMap[key].count += 1;
      regionMap[key].valuation += value;

      if (!regionCategoryMap[key]) regionCategoryMap[key] = {};
      if (!regionCategoryMap[key][item.category]) regionCategoryMap[key][item.category] = { count: 0, valuation: 0 };
      regionCategoryMap[key][item.category].count += 1;
      regionCategoryMap[key][item.category].valuation += value;
    }

    // Cave distribution
    if (item.cellarId) {
      if (!caveMap[item.cellarId]) caveMap[item.cellarId] = { count: 0, valuation: 0 };
      caveMap[item.cellarId].count += 1;
      caveMap[item.cellarId].valuation += value;
    }

    // #573: a finished bottle has been drunk — it no longer calls for a
    // tasting, has no place in the maturity planning and no ageing ahead.
    // Everything below only describes the bottles in stock.
    if (isFinishedItem(item)) continue;
    inStockCount += 1;

    if (item.alertStatus === 'past' || item.alertStatus === 'peak') urgentDegustationCount += 1;

    if (item.alertStatus === 'past') {
      pastPeak += 1;
    } else if (item.alertStatus === 'peak') {
      atPeak += 1;
    } else if (item.alertStatus === 'approaching') {
      preserve += 1;
    } else {
      noWindow += 1;
    }

    // Garde histogram: distribute the bottle across the years of its peak
    // window, but shaped by its FEAT-86 consumption curve — a bottle counts
    // only in the years where its readiness is within half of its own best
    // year, so a bell wine clusters around its peak and a twin-peak wine
    // shows two humps. PLATEAU/LINEAR keep spanning (nearly) the whole
    // window, matching the pre-FEAT-86 behaviour. The bottle never vanishes:
    // the argmax year always clears the half-of-best bar.
    if (item.peakMaturityFrom != null || item.peakMaturityTo != null) {
      const from = item.peakMaturityFrom ?? item.peakMaturityTo!;
      const to = item.peakMaturityTo ?? item.peakMaturityFrom!;
      const startYear = Math.max(from, currentYear - GARDE_HORIZON_PAST);
      const endYear = Math.min(to, currentYear + GARDE_HORIZON_FUTURE);

      const shape = (item.curveShape as CurveShape | null) ?? undefined;
      const weights: { year: number; w: number }[] = [];
      let maxW = 0;
      for (let y = startYear; y <= endYear; y++) {
        const w = readinessIndex({ shape, from, to, year: y }) ?? 0;
        weights.push({ year: y, w });
        if (w > maxW) maxW = w;
      }
      const cutoff = maxW * 0.5;
      for (const { year, w } of weights) {
        if (w >= cutoff) gardeMap[year] = (gardeMap[year] ?? 0) + 1;
      }
    }
  }

  const total = items.length;
  // The maturity buckets split the bottles in stock, so they add up to 100 %.
  const pct = (n: number) => (inStockCount > 0 ? Math.round((n / inStockCount) * 100) : 0);

  const movements: MovementStats = {
    added: auditMovements.find(r => r.action === 'CREATE')?._count.action ?? 0,
    consumed: consumedCount,
    deleted: auditMovements.find(r => r.action === 'DELETE')?._count.action ?? 0,
    restored: auditMovements.find(r => r.action === 'RESTORE')?._count.action ?? 0,
  };

  // Build garde histogram sorted by year
  const gardeHistogram = Object.entries(gardeMap)
    .map(([year, count]) => ({ year: parseInt(year, 10), count }))
    .sort((a, b) => a.year - b.year);

  // Build cave distribution with names from cellars list
  const cellarById = Object.fromEntries(cellars.map(c => [c.id, c]));
  const caveDistribution: CavePoint[] = Object.entries(caveMap)
    .map(([cellarId, { count, valuation }]) => ({
      cellarId,
      cellarName: cellarById[cellarId]?.name ?? cellarId,
      cellarType: cellarById[cellarId]?.type ?? 'VINTAGE',
      count,
      valuation: Math.round(valuation),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    period: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      scope: ANALYTICS_PERIOD_SCOPE,
    },
    totalValuation: Math.round(totalValuation),
    totalPurchasePrice: Math.round(totalPurchasePrice),
    totalLiquidLiters: Math.round(totalLiquidLiters * 100) / 100,
    cigarModulesCount,
    urgentDegustationCount,
    totalActiveItems: total,
    categoryBreakdown: Object.entries(categoryMap)
      .map(([category, { count, valuation }]) => ({ category, count, valuation: Math.round(valuation) }))
      .sort((a, b) => b.count - a.count),
    regionBreakdown: Object.entries(regionMap)
      .map(([region, { count, valuation }]) => ({ region, count, valuation: Math.round(valuation) }))
      .sort((a, b) => b.count - a.count || b.valuation - a.valuation)
      .slice(0, 10),
    regionCategoryBreakdown: Object.entries(regionCategoryMap)
      .flatMap(([region, byCategory]) =>
        Object.entries(byCategory).map(([category, { count, valuation }]) => ({
          region,
          category,
          count,
          valuation: Math.round(valuation),
        }))
      )
      .sort((a, b) => b.count - a.count || b.valuation - a.valuation),
    maturityPlanning: {
      preserve: { count: preserve, percent: pct(preserve) },
      atPeak: { count: atPeak, percent: pct(atPeak) },
      pastPeak: { count: pastPeak, percent: pct(pastPeak) },
      noWindow: { count: noWindow, percent: pct(noWindow) },
    },
    gardeHistogram,
    caveDistribution,
    movements,
  };
}

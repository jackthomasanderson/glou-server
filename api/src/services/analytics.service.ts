import { prisma } from '../lib/prisma';
import { CurveShape, readinessIndex } from '../lib/maturity-curve';
import { consumedUnits, itemCostInStock, itemSpend, itemUnits, itemValue } from '../lib/finished-item';
import { UNIT_COUNT_SELECT } from '../lib/stock-units';
import { ANALYTICS_PERIOD_SCOPE, type AnalyticsStats, type CavePoint, type MovementStats } from '../../../shared/analytics';
import { findKnownRegion, mapLocationOf, normalizeRegionName } from '../../../shared/map-location';

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
  // log's `createdAt`. #838: until movements are logged (#848), every cigar
  // smoked out of a box is dated by the box's last change of any kind.
  const inPeriod = (date: Date) => (!from || date >= from) && (!to || date <= to);

  // ISSUE_035/ISSUE_104: deliberately not spread into the inventory query
  // (ANALYTICS_PERIOD_SCOPE, shared/analytics.ts). Inventory aggregates
  // describe the cellar as it stands right now — a bottle bought in 2019 is
  // still in the cellar today, so leaving it out of the valuation would mislead.
  const [items, cellars, auditMovements] = await Promise.all([
    prisma.inventoryItem.findMany({
      // FEAT-87: analytics describe what the instance holds; a non-owned
      // reference is a wine without bottles (#471), out of every figure here.
      where: { deletedAt: null },
      // #471: what is true of every bottle of the wine (category, region,
      // drinking window) is read on its family.
      select: {
        ...UNIT_COUNT_SELECT,
        bottleSize: true,
        cellarId: true,
        updatedAt: true,
        product: {
          select: {
            category: true,
            region: true,
            appellation: true,
            leafOrigin: true,
            alertStatus: true,
            peakMaturityFrom: true,
            peakMaturityTo: true,
            curveShape: true,
          },
        },
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
  ]);

  let totalValuation = 0;
  let totalPurchasePrice = 0;
  let inStockPurchasePrice = 0;
  let consumedCount = 0;
  let totalLiquidLiters = 0;
  let cigarCount = 0;
  let urgentDegustationCount = 0;
  let noWindow = 0;
  let preserve = 0;
  let atPeak = 0;
  let pastPeak = 0;
  let inStockUnits = 0;

  const categoryMap: Record<string, { count: number; valuation: number }> = {};
  const regionMap: Record<string, { count: number; valuation: number }> = {};
  // FEAT-40/41: region × category composite map, built alongside regionMap
  // from the same loop/values — no second pass over `items`.
  const regionCategoryMap: Record<string, Record<string, { count: number; valuation: number }>> = {};
  // #961: regions are keyed by `normalizeRegionName` ("bordeaux " and
  // "Bordeaux" are one place); the units of each spelling pick the name shown.
  const spellingsByRegion: Record<string, Record<string, number>> = {};
  // #961: units in stock with nothing to place them by, per category.
  const noLocationMap: Record<string, number> = {};
  const caveMap: Record<string, { count: number; valuation: number }> = {};
  // The key of the units in no cellar (a cellar id is a uuid, never empty).
  const NO_CELLAR = '';
  const currentYear = new Date().getFullYear();
  const gardeMap: Record<number, number> = {};
  const GARDE_HORIZON_PAST = 3;
  const GARDE_HORIZON_FUTURE = 20;

  for (const item of items) {
    const { product } = item;
    // #471 (FEAT-96): one rule for every figure (shared/units.ts). A row is a
    // group of N copies: it counts its units in stock (bottles, or cigars) and
    // is worth `itemValue` (#594: estimated value, else purchase price, per
    // copy). A finished or written-off unit counts 0 and is worth 0, but what
    // was spent was spent (`itemSpend`, consistent with budget.service.ts).
    totalPurchasePrice += itemSpend(item);
    // #838: units consumed (each bottle drunk, each cigar smoked) during the
    // period, read from the item's state like every "consumed" figure
    // (lib/finished-item.ts); a write-off is not consumed.
    if (inPeriod(item.updatedAt)) consumedCount += consumedUnits(item);
    const units = itemUnits(item);
    if (units === 0) continue;
    const value = itemValue(item);
    inStockUnits += units;
    totalValuation += value;
    // #838: the cost of the same units as `value`, for the capital gain.
    inStockPurchasePrice += itemCostInStock(item);
    totalLiquidLiters += computeBottleVolume(product.category, item.bottleSize, item.fillLevel) * units;

    if (product.category === 'cigar') cigarCount += units;

    if (!categoryMap[product.category]) categoryMap[product.category] = { count: 0, valuation: 0 };
    categoryMap[product.category].count += units;
    categoryMap[product.category].valuation += value;

    const location = mapLocationOf(product);
    if (location) {
      const key = normalizeRegionName(location);
      if (!regionMap[key]) regionMap[key] = { count: 0, valuation: 0 };
      regionMap[key].count += units;
      regionMap[key].valuation += value;

      if (!regionCategoryMap[key]) regionCategoryMap[key] = {};
      if (!regionCategoryMap[key][product.category]) regionCategoryMap[key][product.category] = { count: 0, valuation: 0 };
      regionCategoryMap[key][product.category].count += units;
      regionCategoryMap[key][product.category].valuation += value;

      const spellings = (spellingsByRegion[key] ??= {});
      spellings[location] = (spellings[location] ?? 0) + units;
    } else {
      noLocationMap[product.category] = (noLocationMap[product.category] ?? 0) + units;
    }

    // Cave distribution. Recette #847 (KO 10.2): a unit in no cellar counts
    // too, under its own entry — the distribution sums to the stock.
    const cave = item.cellarId ?? NO_CELLAR;
    if (!caveMap[cave]) caveMap[cave] = { count: 0, valuation: 0 };
    caveMap[cave].count += units;
    caveMap[cave].valuation += value;

    // #573: a finished bottle has been drunk — it no longer calls for a
    // tasting, has no place in the maturity planning and no ageing ahead
    // (skipped above, with 0 units). Everything below describes the bottles
    // in stock, each counted once.
    if (product.alertStatus === 'past' || product.alertStatus === 'peak') urgentDegustationCount += units;

    if (product.alertStatus === 'past') {
      pastPeak += units;
    } else if (product.alertStatus === 'peak') {
      atPeak += units;
    } else if (product.alertStatus === 'approaching') {
      preserve += units;
    } else {
      noWindow += units;
    }

    // Garde histogram: distribute the bottle across the years of its peak
    // window, but shaped by its FEAT-86 consumption curve — a bottle counts
    // only in the years where its readiness is within half of its own best
    // year, so a bell wine clusters around its peak and a twin-peak wine
    // shows two humps. PLATEAU/LINEAR keep spanning (nearly) the whole
    // window, matching the pre-FEAT-86 behaviour. The bottle never vanishes:
    // the argmax year always clears the half-of-best bar.
    if (product.peakMaturityFrom != null || product.peakMaturityTo != null) {
      const from = product.peakMaturityFrom ?? product.peakMaturityTo!;
      const to = product.peakMaturityTo ?? product.peakMaturityFrom!;
      const startYear = Math.max(from, currentYear - GARDE_HORIZON_PAST);
      const endYear = Math.min(to, currentYear + GARDE_HORIZON_FUTURE);

      const shape = (product.curveShape as CurveShape | null) ?? undefined;
      const weights: { year: number; w: number }[] = [];
      let maxW = 0;
      for (let y = startYear; y <= endYear; y++) {
        const w = readinessIndex({ shape, from, to, year: y }) ?? 0;
        weights.push({ year: y, w });
        if (w > maxW) maxW = w;
      }
      const cutoff = maxW * 0.5;
      for (const { year, w } of weights) {
        if (w >= cutoff) gardeMap[year] = (gardeMap[year] ?? 0) + units;
      }
    }
  }

  // #961: one name per region — the map's own when it knows the place, else
  // the spelling of most units (alphabetical on a tie, to stay stable).
  const regionName = (key: string): string => {
    const spellings = Object.entries(spellingsByRegion[key]);
    const known = findKnownRegion(spellings[0][0]);
    if (known) return known.name;
    spellings.sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    return spellings[0][0];
  };

  // The maturity buckets split the units in stock, so they add up to 100 %.
  const pct = (n: number) => (inStockUnits > 0 ? Math.round((n / inStockUnits) * 100) : 0);

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
    .map(([key, { count, valuation }]) => {
      // The units in no cellar: no id, no name (the client says "Sans cave").
      const cellarId = key === NO_CELLAR ? null : key;
      return {
        cellarId,
        cellarName: cellarId === null ? '' : cellarById[cellarId]?.name ?? cellarId,
        cellarType: cellarId === null ? 'VINTAGE' : cellarById[cellarId]?.type ?? 'VINTAGE',
        count,
        valuation: Math.round(valuation),
      };
    })
    // Most stocked first; the units in no cellar last, after every cellar.
    .sort((a, b) => Number(a.cellarId === null) - Number(b.cellarId === null) || b.count - a.count);

  return {
    period: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      scope: ANALYTICS_PERIOD_SCOPE,
    },
    totalValuation: Math.round(totalValuation),
    totalPurchasePrice: Math.round(totalPurchasePrice),
    inStockPurchasePrice: Math.round(inStockPurchasePrice),
    totalLiquidLiters: Math.round(totalLiquidLiters * 100) / 100,
    cigarCount,
    urgentDegustationCount,
    totalActiveItems: inStockUnits,
    categoryBreakdown: Object.entries(categoryMap)
      .map(([category, { count, valuation }]) => ({ category, count, valuation: Math.round(valuation) }))
      .sort((a, b) => b.count - a.count),
    regionBreakdown: Object.entries(regionMap)
      .map(([key, { count, valuation }]) => ({ region: regionName(key), count, valuation: Math.round(valuation) }))
      .sort((a, b) => b.count - a.count || b.valuation - a.valuation)
      .slice(0, 10),
    regionCategoryBreakdown: Object.entries(regionCategoryMap)
      .flatMap(([key, byCategory]) =>
        Object.entries(byCategory).map(([category, { count, valuation }]) => ({
          region: regionName(key),
          category,
          count,
          valuation: Math.round(valuation),
        }))
      )
      .sort((a, b) => b.count - a.count || b.valuation - a.valuation),
    noLocationBreakdown: Object.entries(noLocationMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
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

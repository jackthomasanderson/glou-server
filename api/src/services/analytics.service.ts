import { prisma } from '../lib/prisma';

export interface CategoryStat {
  category: string;
  count: number;
  valuation: number;
}

export interface RegionStat {
  region: string;
  count: number;
  valuation: number;
}

export interface MaturityPlanning {
  readyNow: { count: number; percent: number };
  preserve: { count: number; percent: number };
  pastPeak: { count: number; percent: number };
}

export interface GardePoint {
  year: number;
  count: number;
}

export interface CavePoint {
  cellarId: string;
  cellarName: string;
  cellarType: string;
  count: number;
  valuation: number;
}

export interface MovementStats {
  added: number;
  consumed: number;
  restored: number;
}

export interface AnalyticsStats {
  totalValuation: number;
  totalPurchasePrice: number;
  totalLiquidLiters: number;
  cigarModulesCount: number;
  urgentDegustationCount: number;
  totalActiveItems: number;
  categoryBreakdown: CategoryStat[];
  regionBreakdown: RegionStat[];
  maturityPlanning: MaturityPlanning;
  gardeHistogram: GardePoint[];
  caveDistribution: CavePoint[];
  movements: MovementStats;
}

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

export async function getAnalytics(userId: string, from?: Date, to?: Date): Promise<AnalyticsStats> {
  const dateFilter = from || to
    ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  const [items, cellars, auditMovements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { userId, deletedAt: null },
      select: {
        category: true,
        estimatedValue: true,
        purchasePrice: true,
        bottleSize: true,
        fillLevel: true,
        region: true,
        leafOrigin: true,
        alertStatus: true,
        peakMaturityFrom: true,
        peakMaturityTo: true,
        cellarId: true,
      },
    }),
    prisma.cellar.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        userId,
        action: { in: ['CREATE', 'DELETE', 'RESTORE'] },
        status: 'success',
        ...dateFilter,
      },
      _count: { action: true },
    }),
  ]);

  let totalValuation = 0;
  let totalPurchasePrice = 0;
  let totalLiquidLiters = 0;
  let cigarModulesCount = 0;
  let urgentDegustationCount = 0;
  let readyNow = 0;
  let preserve = 0;
  let pastPeak = 0;

  const categoryMap: Record<string, { count: number; valuation: number }> = {};
  const regionMap: Record<string, { count: number; valuation: number }> = {};
  const caveMap: Record<string, { count: number; valuation: number }> = {};
  const currentYear = new Date().getFullYear();
  const gardeMap: Record<number, number> = {};
  const GARDE_HORIZON_PAST = 3;
  const GARDE_HORIZON_FUTURE = 20;

  for (const item of items) {
    const value = item.estimatedValue ?? item.purchasePrice ?? 0;
    totalValuation += value;
    totalPurchasePrice += item.purchasePrice ?? 0;
    totalLiquidLiters += computeBottleVolume(item.category, item.bottleSize, item.fillLevel);

    if (item.category === 'cigar') cigarModulesCount += 1;
    if (item.alertStatus === 'past') urgentDegustationCount += 1;

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
    }

    if (item.alertStatus === 'past') {
      pastPeak += 1;
    } else if (item.alertStatus === 'approaching') {
      preserve += 1;
    } else {
      readyNow += 1;
    }

    // Garde histogram: distribute item across its peak window years
    if (item.peakMaturityFrom != null || item.peakMaturityTo != null) {
      const from = item.peakMaturityFrom ?? item.peakMaturityTo!;
      const to = item.peakMaturityTo ?? item.peakMaturityFrom!;
      const startYear = Math.max(from, currentYear - GARDE_HORIZON_PAST);
      const endYear = Math.min(to, currentYear + GARDE_HORIZON_FUTURE);
      for (let y = startYear; y <= endYear; y++) {
        gardeMap[y] = (gardeMap[y] ?? 0) + 1;
      }
    }

    // Cave distribution
    if (item.cellarId) {
      if (!caveMap[item.cellarId]) caveMap[item.cellarId] = { count: 0, valuation: 0 };
      caveMap[item.cellarId].count += 1;
      caveMap[item.cellarId].valuation += value;
    }
  }

  const total = items.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const movements: MovementStats = {
    added: auditMovements.find(r => r.action === 'CREATE')?._count.action ?? 0,
    consumed: auditMovements.find(r => r.action === 'DELETE')?._count.action ?? 0,
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
    maturityPlanning: {
      readyNow: { count: readyNow, percent: pct(readyNow) },
      preserve: { count: preserve, percent: pct(preserve) },
      pastPeak: { count: pastPeak, percent: pct(pastPeak) },
    },
    gardeHistogram,
    caveDistribution,
    movements,
  };
}

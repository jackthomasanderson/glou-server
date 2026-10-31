// #466: response of GET /api/analytics, shared by api/ and web/. Import only from shared/.

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

/**
 * FEAT-40/41: region × category split. Unlike `regionBreakdown` (top 10
 * regions for the dashboard widget), it carries every region, for the world map.
 */
export interface RegionCategoryStat {
  region: string;
  category: string;
  count: number;
  valuation: number;
}

export interface MaturityPlanning {
  preserve: { count: number; percent: number };
  atPeak: { count: number; percent: number };
  pastPeak: { count: number; percent: number };
  /** ISSUE_100: items with no peak-maturity window, not tracked for readiness at all. */
  noWindow: { count: number; percent: number };
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
  /** Bottles finished during the period (opened, fill level 0), dated by `updatedAt` — not items moved to the trash. */
  consumed: number;
  /** Items moved to the trash during the period. */
  deleted: number;
  restored: number;
}

/**
 * ISSUE_035/ISSUE_104: the from/to range narrows the movement counters only;
 * every other aggregate describes the cellar as it stands today. The scope is
 * part of the contract so the web can say so.
 */
export const ANALYTICS_PERIOD_SCOPE = 'movements' as const;

export interface AnalyticsPeriod {
  /** Lower bound as an ISO 8601 timestamp, or null when unbounded. */
  from: string | null;
  /** Upper bound as an ISO 8601 timestamp, or null when unbounded. */
  to: string | null;
  /** Which part of the payload the range actually filters. */
  scope: typeof ANALYTICS_PERIOD_SCOPE;
}

/**
 * #471 (FEAT-96): every count is in units in stock (bottles, or cigars —
 * shared/units.ts `itemUnits`), every valuation follows `itemValue` (#594),
 * and `totalPurchasePrice` is spending (`itemSpend`: drunk and written-off
 * copies included).
 */
export interface AnalyticsStats {
  period: AnalyticsPeriod;
  totalValuation: number;
  totalPurchasePrice: number;
  totalLiquidLiters: number;
  /** Cigars in stock. */
  cigarCount: number;
  /** Units in stock at or past their peak. */
  urgentDegustationCount: number;
  /** Units in stock, bottles and cigars together (the sum of `categoryBreakdown`). */
  totalActiveItems: number;
  categoryBreakdown: CategoryStat[];
  regionBreakdown: RegionStat[];
  regionCategoryBreakdown: RegionCategoryStat[];
  maturityPlanning: MaturityPlanning;
  gardeHistogram: GardePoint[];
  caveDistribution: CavePoint[];
  movements: MovementStats;
}

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

/** #961: units in stock of a category that have nothing to place them on the map by. */
export interface NoLocationStat {
  category: string;
  count: number;
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
  /** Null: the units in no cellar ("Sans cave"), so the distribution sums to the stock (recette #847, KO 10.2). */
  cellarId: string | null;
  /** Empty for the units in no cellar: the client names them. */
  cellarName: string;
  cellarType: string;
  count: number;
  valuation: number;
}

export interface MovementStats {
  /** #848: bottles (cigars) added during the period, from the movement journal. */
  added: number;
  /**
   * #838: units consumed during the period — each bottle drunk, each cigar
   * smoked (shared/units.ts `consumedUnits`), dated by the item's `updatedAt`.
   * Not written-off units, not items moved to the trash.
   */
  consumed: number;
  /** #848: bottles (cigars) moved to the trash during the period, from the movement journal. */
  deleted: number;
  /** #848: bottles (cigars) restored from the trash during the period, from the movement journal. */
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
 * copies included). #838: the capital gain is `totalValuation −
 * inStockPurchasePrice`, value and cost of the same units.
 */
export interface AnalyticsStats {
  period: AnalyticsPeriod;
  totalValuation: number;
  totalPurchasePrice: number;
  /** #838: purchase cost of the units in stock (`itemCostInStock`), what `totalValuation` compares to. */
  inStockPurchasePrice: number;
  totalLiquidLiters: number;
  /** Cigars in stock. */
  cigarCount: number;
  /** Units in stock at or past their peak. */
  urgentDegustationCount: number;
  /** Units in stock, bottles and cigars together (the sum of `categoryBreakdown`). */
  totalActiveItems: number;
  /** #702: units in stock with neither an estimated value nor a purchase price (worth 0 € in `totalValuation`). */
  unpricedUnits: number;
  /** #702: of `unpricedUnits`, the cigars (the rest are bottles), so the KPI names them. */
  unpricedCigars: number;
  categoryBreakdown: CategoryStat[];
  regionBreakdown: RegionStat[];
  /**
   * #961: regions are grouped regardless of case, spaces and accents
   * (shared/map-location.ts `normalizeRegionName`) and named once; a wine
   * without a region is placed by its appellation when the map knows it.
   */
  regionCategoryBreakdown: RegionCategoryStat[];
  /** #961: units in stock with neither a region nor a placeable appellation, by category. */
  noLocationBreakdown: NoLocationStat[];
  maturityPlanning: MaturityPlanning;
  gardeHistogram: GardePoint[];
  caveDistribution: CavePoint[];
  movements: MovementStats;
}

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

// FEAT-40/41: full region × category split (not capped to top 10 like
// regionBreakdown) — feeds the world map's category filter and heatmap mode.
export interface RegionCategoryStat {
  region: string;
  category: string;
  count: number;
  valuation: number;
}

export interface MaturityPlanning {
  readyNow: { count: number; percent: number };
  preserve: { count: number; percent: number };
  atPeak: { count: number; percent: number };
  pastPeak: { count: number; percent: number };
}

export interface MovementStats {
  added: number;
  /** Bottles actually finished in the period, not items moved to the trash. */
  consumed: number;
  /** Items moved to the trash in the period, counted separately. */
  deleted: number;
  restored: number;
}

// ISSUE_035/ISSUE_104: the `from`/`to` range narrows the movement counters
// only — every other aggregate describes the cellar as it stands today. The
// API echoes the applied range and its scope so the UI can say so explicitly.
export interface AnalyticsPeriod {
  from: string | null;
  to: string | null;
  scope: 'movements';
}

export interface AnalyticsStats {
  period: AnalyticsPeriod;
  totalValuation: number;
  totalPurchasePrice: number;
  totalLiquidLiters: number;
  cigarModulesCount: number;
  urgentDegustationCount: number;
  totalActiveItems: number;
  categoryBreakdown: CategoryStat[];
  regionBreakdown: RegionStat[];
  regionCategoryBreakdown: RegionCategoryStat[];
  maturityPlanning: MaturityPlanning;
  gardeHistogram: GardePoint[];
  caveDistribution: CavePoint[];
  movements: MovementStats;
}

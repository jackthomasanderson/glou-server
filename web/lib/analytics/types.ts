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
  regionCategoryBreakdown: RegionCategoryStat[];
  maturityPlanning: MaturityPlanning;
  gardeHistogram: GardePoint[];
  caveDistribution: CavePoint[];
  movements: MovementStats;
}

import { InventoryCategory } from '@/lib/inventory/types';

export type TastingReadiness = 'TOO_YOUNG' | 'PERFECT' | 'PEAK' | 'PAST';

export interface TastingItemSummary {
  id: string;
  name: string;
  producer: string;
  category: InventoryCategory;
  photoUrl?: string | null;
  color?: string | null;
  spiritType?: string | null;
  sparklingType?: string | null;
  format?: string | null;
}

/** #471 (FEAT-107): the wine (family) tasted — the only thing known of a wine tasted elsewhere. */
export interface TastingProductSummary {
  id: string;
  name: string;
  producer: string;
  category: InventoryCategory;
  vintage?: number | null;
  photoUrl?: string | null;
  color?: string | null;
  spiritType?: string | null;
  sparklingType?: string | null;
  format?: string | null;
}

/** #471 (FEAT-107): a wine tasted elsewhere, named: Glou finds it, or adds it without any bottle. */
export interface TastedWine {
  category: InventoryCategory;
  producer: string;
  name: string;
  vintage?: number | null;
  /** A cigar's vitola. */
  format?: string | null;
}

export interface TastingNote {
  id: string;
  userId: string;
  /** The bottle tasted; null for a wine tasted elsewhere. */
  itemId?: string | null;
  item?: TastingItemSummary | null;
  productId?: string | null;
  product?: TastingProductSummary | null;
  tastedAt: string;
  context?: string | null;
  rating?: number | null;
  readiness?: TastingReadiness | null;
  notes?: string | null;
  foodPairing?: string | null;
  photoUrl?: string | null;
  // Structured wine tasting grid (data-model audit, Task 2, expert mode only)
  robe?: string | null;
  nez?: string | null;
  bouche?: string | null;
  tanin?: number | null;
  acidite?: number | null;
  longueurBouche?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TastingListResult {
  notes: TastingNote[];
  total: number;
  page: number;
  limit: number;
}

export interface TastingFormValues {
  /** The bottle tasted, when it is one of the cellar. */
  itemId?: string;
  /** #471 (FEAT-107): the wine tasted (never changed once saved). */
  productId?: string;
  /** #471 (FEAT-107): a wine named, not picked from the list (creation only). */
  wine?: TastedWine;
  tastedAt?: string;
  context?: string;
  rating?: number | null;
  readiness?: TastingReadiness | null;
  notes?: string;
  foodPairing?: string;
  photoUrl?: string | null;
  // Structured wine tasting grid (data-model audit, Task 2, expert mode only)
  robe?: string | null;
  nez?: string | null;
  bouche?: string | null;
  tanin?: number | null;
  acidite?: number | null;
  longueurBouche?: number | null;
}

export interface TastingProducerRank {
  producer: string;
  avgRating: number;
  count: number;
}

export interface TastingItemRank {
  id: string;
  name: string;
  producer: string;
  avgRating: number;
  count: number;
}

export interface TastingReadinessDistribution {
  TOO_YOUNG: number;
  PERFECT: number;
  PEAK: number;
  PAST: number;
}

export interface TastingAnalytics {
  producerRankings: TastingProducerRank[];
  topItems: TastingItemRank[];
  flopItems: TastingItemRank[];
  readinessDistribution: TastingReadinessDistribution;
}

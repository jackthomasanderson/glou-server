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

export interface TastingNote {
  id: string;
  userId: string;
  itemId?: string | null;
  item?: TastingItemSummary | null;
  tastedAt: string;
  context?: string | null;
  rating?: number | null;
  readiness?: TastingReadiness | null;
  notes?: string | null;
  foodPairing?: string | null;
  photoUrl?: string | null;
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
  itemId?: string;
  tastedAt?: string;
  context?: string;
  rating?: number | null;
  readiness?: TastingReadiness | null;
  notes?: string;
  foodPairing?: string;
  photoUrl?: string | null;
}

export interface TastingItemStats {
  count: number;
  avgRating: number | null;
  lastTastedAt: string;
  lastRating: number | null;
  lastReadiness: TastingReadiness | null;
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

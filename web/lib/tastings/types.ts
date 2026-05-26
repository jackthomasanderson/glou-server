import { InventoryCategory } from '@/lib/inventory/types';

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
  notes?: string;
  foodPairing?: string;
  photoUrl?: string | null;
}

export type WishlistCategory = 'wine' | 'sparkling' | 'spirit' | 'cigar';
export type WishlistStatus = 'active' | 'acquired' | 'cancelled';

export interface WishlistItem {
  id: string;
  userId: string;
  name: string;
  producer: string | null;
  category: WishlistCategory;
  vintage: number | null;
  targetQuantity: number;
  maxPrice: number | null;
  lastSeenPrice: number | null;
  lastSeenAt: string | null;
  status: WishlistStatus;
  acquiredItemId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistCreateInput {
  name: string;
  producer?: string;
  category: WishlistCategory;
  vintage?: number | null;
  targetQuantity: number;
  maxPrice?: number | null;
  notes?: string | null;
}

export type WishlistPatchInput = Partial<WishlistCreateInput> & { status?: WishlistStatus };

export interface ConvertToInventoryInput {
  purchasePrice?: number | null;
  purchasePlace?: string | null;
  cellarId?: string | null;
  bottleSize?: string | null;
  quantity?: number | null;
}

export interface ConvertResult {
  wishlistItem: WishlistItem;
  inventoryItem: { id: string; name: string; category: WishlistCategory };
}

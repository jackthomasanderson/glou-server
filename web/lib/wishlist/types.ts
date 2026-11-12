import type { InventoryCategory } from '../inventory/types';

// ISSUE_137: alias of the single category source, not an independent list.
export type WishlistCategory = InventoryCategory;
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
  /** #471 (FEAT-97): "Vous avez déjà ce vin" — the known wine the bottles join (no place of purchase then). */
  productId?: string;
  /** FEAT-95: a cigar group of closed boxes of this many cigars; null, single cigars. */
  cigarsPerBox?: number | null;
  /** #471 (FEAT-97 c5): "C'est un autre vin" — the wines of the same name the new one is not. */
  distinctFrom?: string[];
  /** #587: a spirit's ABV; absent or null, unknown. */
  alcoholDegree?: number | null;
}

export interface ConvertResult {
  wishlistItem: WishlistItem;
  inventoryItem: { id: string; name: string; category: WishlistCategory };
}

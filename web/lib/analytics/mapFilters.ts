import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';

// FEAT-42: all filtering here runs client-side over the already-loaded
// inventory list (see useInventory) — no dedicated server-side filter
// endpoint, consistent with the rest of the app's client-side filtering
// (cf. FEAT-84 pagination, InventoryDashboard's in-memory filters).

export type MapOpenedState = 'all' | 'inCellar' | 'opened';

export interface MapFiltersState {
  /** Empty array = all categories. */
  categories: InventoryCategory[];
  priceMin: string;
  priceMax: string;
  vintageMin: string;
  vintageMax: string;
  /** 0 = no rating filter (any / unrated included). */
  minRating: number;
  openedState: MapOpenedState;
}

export const DEFAULT_MAP_FILTERS: MapFiltersState = {
  categories: [],
  priceMin: '',
  priceMax: '',
  vintageMin: '',
  vintageMax: '',
  minRating: 0,
  openedState: 'all',
};

/**
 * Region used to group an item on the world map — mirrors the backend logic
 * in analytics.service.ts (`getAnalytics`): cigars are grouped by leaf
 * origin (falling back to region), everything else by region directly.
 * Keeping this in sync manually is a known duplication (see report) — the
 * alternative (deriving map region server-side per item) is out of the
 * strict FEAT-40/41/42 scope defined for this pass.
 */
export function getItemMapRegion(item: InventoryItem): string | null {
  const region = item.category === 'cigar' ? (item.leafOrigin ?? item.region) : item.region;
  const trimmed = region?.trim();
  return trimmed ? trimmed : null;
}

export function hasActiveMapFilters(filters: MapFiltersState): boolean {
  return (
    filters.categories.length > 0 ||
    filters.priceMin !== '' ||
    filters.priceMax !== '' ||
    filters.vintageMin !== '' ||
    filters.vintageMax !== '' ||
    filters.minRating > 0 ||
    filters.openedState !== 'all'
  );
}

export function itemMatchesMapFilters(
  item: InventoryItem,
  filters: MapFiltersState,
  ratingByItemId: Map<string, number>,
  regionFilter: string | null
): boolean {
  if (regionFilter && getItemMapRegion(item) !== regionFilter) return false;

  if (filters.categories.length > 0 && !filters.categories.includes(item.category)) return false;

  const value = item.estimatedValue ?? item.purchasePrice ?? null;
  if (filters.priceMin !== '') {
    const min = parseFloat(filters.priceMin);
    if (!isNaN(min) && (value === null || value < min)) return false;
  }
  if (filters.priceMax !== '') {
    const max = parseFloat(filters.priceMax);
    if (!isNaN(max) && (value === null || value > max)) return false;
  }

  if (filters.vintageMin !== '') {
    const min = parseInt(filters.vintageMin, 10);
    if (!isNaN(min) && (item.vintage == null || item.vintage < min)) return false;
  }
  if (filters.vintageMax !== '') {
    const max = parseInt(filters.vintageMax, 10);
    if (!isNaN(max) && (item.vintage == null || item.vintage > max)) return false;
  }

  if (filters.minRating > 0) {
    const rating = ratingByItemId.get(item.id);
    if (rating === undefined || rating < filters.minRating) return false;
  }

  if (filters.openedState === 'inCellar' && item.isOpened) return false;
  if (filters.openedState === 'opened' && !item.isOpened) return false;

  return true;
}

import { itemUnits } from '@shared/units';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { Product, ProductItem } from '@/lib/products/types';

// FEAT-42: all filtering here runs client-side over the already-loaded
// inventory list (see useInventory) — no dedicated server-side filter
// endpoint, consistent with the rest of the app's client-side filtering
// (cf. FEAT-84 pagination, InventoryDashboard's in-memory filters).

export type MapOpenedState = 'all' | 'inCellar' | 'opened';

/** The label of each state filter, written whole so that a missing key is seen (acceptance run v3 of #471). */
export const MAP_OPENED_STATE_LABELS: Record<MapOpenedState, string> = {
  all: 'analytics.map.filters.stateAll',
  inCellar: 'analytics.map.filters.stateInCellar',
  opened: 'analytics.map.filters.stateOpened',
};

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
 * Region used to group a wine on the world map — mirrors the backend logic
 * in analytics.service.ts (`getAnalytics`): cigars are grouped by leaf
 * origin (falling back to region), everything else by region directly.
 * Keeping this in sync manually is a known duplication (see report) — the
 * alternative (deriving map region server-side per item) is out of the
 * strict FEAT-40/41/42 scope defined for this pass.
 */
export function getProductMapRegion(product: Pick<Product, 'category' | 'region' | 'leafOrigin'>): string | null {
  const region = product.category === 'cigar' ? (product.leafOrigin ?? product.region) : product.region;
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

/** A unit still in the cellar (the trash is outside it too): what the map's list describes. */
const inStock = (item: ProductItem) => item.deletedAt == null && itemUnits(item) > 0;

/**
 * Recette n°5 ter of #847: the list under the map shows one row per wine,
 * and only the wines still in the cellar (the map's own scope, `summarizeStock`
 * over the units in stock), like the inventory list without "Plus en cave".
 * Price and opened state are read on its units in stock: a wine matches when
 * at least one of them does.
 */
export function productMatchesMapFilters(
  product: Product,
  filters: MapFiltersState,
  ratingByProductId: Map<string, number>,
  regionFilter: string | null
): boolean {
  const units = product.items.filter(inStock);
  if (units.length === 0) return false;

  if (regionFilter && getProductMapRegion(product) !== regionFilter) return false;

  if (filters.categories.length > 0 && !filters.categories.includes(product.category)) return false;

  const min = filters.priceMin !== '' ? parseFloat(filters.priceMin) : NaN;
  const max = filters.priceMax !== '' ? parseFloat(filters.priceMax) : NaN;
  if (!isNaN(min) || !isNaN(max)) {
    const priced = units.some((item) => {
      const value = item.estimatedValue ?? item.purchasePrice ?? null;
      return value !== null && (isNaN(min) || value >= min) && (isNaN(max) || value <= max);
    });
    if (!priced) return false;
  }

  if (filters.vintageMin !== '') {
    const min = parseInt(filters.vintageMin, 10);
    if (!isNaN(min) && (product.vintage == null || product.vintage < min)) return false;
  }
  if (filters.vintageMax !== '') {
    const max = parseInt(filters.vintageMax, 10);
    if (!isNaN(max) && (product.vintage == null || product.vintage > max)) return false;
  }

  if (filters.minRating > 0) {
    const rating = ratingByProductId.get(product.id);
    if (rating === undefined || rating < filters.minRating) return false;
  }

  if (filters.openedState === 'inCellar' && !units.some((item) => !item.isOpened)) return false;
  if (filters.openedState === 'opened' && !units.some((item) => item.isOpened)) return false;

  return true;
}

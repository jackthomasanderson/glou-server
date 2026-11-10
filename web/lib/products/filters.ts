import { summarizeStock, unitKind, type StockSummary } from '@shared/units';
import { alertUrgency } from '@/lib/inventory/types';
import type { Product } from './types';

export type InventorySortBy = 'default' | 'value' | 'urgency' | 'name';
export type InventoryOpenedFilter = 'all' | 'full' | 'opened' | 'alerts';

/**
 * #707: the cellar filter's entry for the bottles without a cellar (a deleted
 * cellar leaves its bottles there). A real cellar id is never empty.
 */
export const NO_CELLAR = '';

/** Everything the filter panel and the search box can narrow the list of wines with. */
export interface ProductFilterCriteria {
  lockedCategories?: readonly string[];
  selectedCollectionId: string | null;
  selectedCategories: readonly string[];
  selectedWineColors: readonly string[];
  selectedCellars: readonly string[];
  selectedTags: readonly string[];
  minValue: string;
  maxValue: string;
  openedFilter: InventoryOpenedFilter;
  /** "Plus en cave" (FEAT-101): only the wines without anything left in stock. */
  showGone: boolean;
  searchQuery: string;
  sortBy: InventorySortBy;
}

export interface ProductFilterContext {
  /** Cellar names, for the search. */
  cellarNames: ReadonlyMap<string, string>;
  categoryLabel: (category: string) => string;
  /** Today (`YYYY-MM-DD`, local) for the "alerts" filter; null before mount, which then lists nothing. */
  today: string | null;
}

const stockCache = new WeakMap<Product, StockSummary>();

/** A family's units in stock, computed once per list object. */
export function stockSummaryOf(product: Product): StockSummary {
  let summary = stockCache.get(product);
  if (!summary) {
    summary = summarizeStock(product.items, { kind: unitKind(product.category) });
    stockCache.set(product, summary);
  }
  return summary;
}

/** Nothing left in stock: drunk, written off, or only tasted elsewhere (FEAT-101). */
export const isGone = (product: Product) => stockSummaryOf(product).units === 0;

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s: string) => s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();

/** Value of one bottle (box, single cigar) of each unit in stock (#594); a wine without any counts 0. */
function copyValues(product: Product): number[] {
  const values = product.items.map((item) => item.estimatedValue ?? item.purchasePrice ?? 0);
  return values.length > 0 ? values : [0];
}

function matchesSearch(product: Product, query: string, ctx: ProductFilterContext): boolean {
  const q = norm(query);
  const cellarNames = product.items
    .map((item) => (item.cellarId ? ctx.cellarNames.get(item.cellarId) : undefined))
    .filter(Boolean) as string[];
  const haystack = [
    product.name, product.producer, product.vintage?.toString(),
    ctx.categoryLabel(product.category), product.region, ...cellarNames,
    ...product.collections.map((c) => c.name),
    ...product.tags,
  ].filter(Boolean) as string[];
  return haystack.some((s) => norm(s).includes(q));
}

/**
 * The wines in scope of the page before any filter: its locked categories,
 * and what is in stock — unless "Plus en cave" asks for the others, or a
 * search, which always finds them (FEAT-101 c2).
 */
export function baseProducts(products: readonly Product[], criteria: ProductFilterCriteria): Product[] {
  const locked = criteria.lockedCategories ?? [];
  return products.filter((product) => {
    if (locked.length > 0 && !locked.includes(product.category)) return false;
    if (criteria.showGone) return isGone(product);
    return criteria.searchQuery.trim() !== '' || !isGone(product);
  });
}

export function filterProducts(
  products: readonly Product[],
  criteria: ProductFilterCriteria,
  ctx: ProductFilterContext,
): Product[] {
  let result = baseProducts(products, criteria);
  const keep = (predicate: (product: Product) => boolean) => { result = result.filter(predicate); };

  if (criteria.selectedCollectionId) {
    const id = criteria.selectedCollectionId;
    keep((p) => p.collections.some((c) => c.id === id));
  }
  if (criteria.selectedCategories.length > 0) keep((p) => criteria.selectedCategories.includes(p.category));
  if (criteria.selectedWineColors.length > 0) {
    keep((p) => p.category !== 'wine' || (!!p.color && criteria.selectedWineColors.includes(p.color)));
  }
  // A wine is in a cellar when some of its bottles in stock are there.
  if (criteria.selectedCellars.length > 0) {
    keep((p) => p.items.some((item) => criteria.selectedCellars.includes(item.cellarId ?? NO_CELLAR)));
  }
  if (criteria.selectedTags.length > 0) keep((p) => criteria.selectedTags.every((tag) => p.tags.includes(tag)));

  const min = criteria.minValue === '' ? NaN : parseFloat(criteria.minValue);
  const max = criteria.maxValue === '' ? NaN : parseFloat(criteria.maxValue);
  if (!isNaN(min) || !isNaN(max)) {
    keep((p) => copyValues(p).some((v) => (isNaN(min) || v >= min) && (isNaN(max) || v <= max)));
  }

  if (criteria.openedFilter === 'full') {
    keep((p) => stockSummaryOf(p).intactUnits > 0);
  } else if (criteria.openedFilter === 'opened') {
    keep((p) => stockSummaryOf(p).opened.length > 0);
  } else if (criteria.openedFilter === 'alerts') {
    const today = ctx.today;
    if (today === null) return [];
    // #573: a wine with nothing left is nothing to drink: no alert, no reminder.
    // #644: as in the bell (#506), only what calls for action now: a wine
    // "approaching" its window may be years away, it is not an alert yet.
    keep((p) => !isGone(p) && (
      (!!p.reminderDate && p.reminderDate.split('T')[0] <= today) ||
      ((p.alertStatus === 'peak' || p.alertStatus === 'past') && !p.alertsPaused)));
  }

  if (criteria.searchQuery.trim()) keep((p) => matchesSearch(p, criteria.searchQuery, ctx));

  if (criteria.sortBy === 'value') {
    result = [...result].sort((a, b) => stockSummaryOf(b).value - stockSummaryOf(a).value);
  } else if (criteria.sortBy === 'urgency') {
    result = [...result].sort((a, b) => alertUrgency(a.alertStatus) - alertUrgency(b.alertStatus));
  } else if (criteria.sortBy === 'name') {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

/**
 * #708: why a chosen collection shows nothing, when the collection itself is
 * the reason: it holds no wine ('empty'), or only finished ones while neither
 * "Plus en cave" nor a search shows them ('allGone'). Null otherwise — other
 * filters may hide its wines, the generic "no result" state applies.
 */
export function collectionEmptiness(
  products: readonly Product[],
  criteria: ProductFilterCriteria,
): 'empty' | 'allGone' | null {
  const id = criteria.selectedCollectionId;
  if (!id) return null;
  const locked = criteria.lockedCategories ?? [];
  const inCollection = products.filter((p) => p.collections.some((c) => c.id === id)
    && (locked.length === 0 || locked.includes(p.category)));
  if (inCollection.length === 0) return 'empty';
  if (!criteria.showGone && criteria.searchQuery.trim() === '' && inCollection.every(isGone)) return 'allGone';
  return null;
}

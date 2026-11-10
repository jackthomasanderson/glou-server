'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Cellar } from '@/lib/cellars/types';
import type { Product } from '@/lib/products/types';
import {
  baseProducts, filterProducts,
  type InventoryOpenedFilter, type InventorySortBy, type ProductFilterCriteria, collectionEmptiness,
} from '@/lib/products/filters';
import { CATEGORY_TITLES } from '@/lib/inventory/category-titles';
import { todayLocalIso } from '@/lib/format';

export interface UseInventoryFiltersOptions {
  /** #471: the wines (families) of the list. */
  products?: Product[];
  cellars?: Cellar[];
  lockedCategories?: string[];
  t: (key: string, options?: Record<string, unknown>) => string;
  /** Guards the "alerts" filter's `new Date()` read so SSR/first-paint markup
   * matches the client (see the same guard on the original inline useMemo). */
  hasMounted: boolean;
}

export interface UseInventoryFiltersResult {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCellars: string[];
  setSelectedCellars: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCollectionId: string | null;
  setSelectedCollectionId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWineColors: string[];
  setSelectedWineColors: React.Dispatch<React.SetStateAction<string[]>>;
  minValue: string;
  setMinValue: React.Dispatch<React.SetStateAction<string>>;
  maxValue: string;
  setMaxValue: React.Dispatch<React.SetStateAction<string>>;
  sortBy: InventorySortBy;
  setSortBy: React.Dispatch<React.SetStateAction<InventorySortBy>>;
  openedFilter: InventoryOpenedFilter;
  /** FEAT-101 "Plus en cave": only the wines with nothing left in stock (hidden otherwise). */
  showGone: boolean;
  setShowGone: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenedFilter: React.Dispatch<React.SetStateAction<InventoryOpenedFilter>>;

  isFiltersOpen: boolean;
  toggleFilters: () => void;

  tagSearchQuery: string;
  setTagSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  showAllTags: boolean;
  setShowAllTags: React.Dispatch<React.SetStateAction<boolean>>;

  clearFilters: () => void;

  /** The page's wines before filtering (locked categories; in stock, or gone with "Plus en cave"). */
  baseItems: Product[];
  filteredItems: Product[];
  hasActiveFilters: boolean;
  /**
   * #503: the category chosen from the navigation (`?category=`). It is the
   * page's scope, not a filter: it does not count in `hasActiveFilters`.
   */
  navCategory: string | null;
  /** #708: the chosen collection holds no wine, or only finished ones (see `collectionEmptiness`). */
  collectionState: 'empty' | 'allGone' | null;
}

/**
 * Owns every piece of state behind the inventory filter panel (category,
 * cellar, collection, tags, wine color, value range, sort, opened/full/alerts
 * quick filter, free-text search) plus the `baseItems`/`filteredItems`
 * derivations and the one-way sync from URL query params (`?filter=`,
 * `?q=`, `?collection=`) into that state.
 *
 * Deliberately NOT included: the `?scan=` → auto-open-item behaviour. That
 * bit needs `setViewingItem`, which is dashboard-local UI state unrelated to
 * filtering, so it stays as its own effect in InventoryDashboard. Both
 * effects read `searchParams` independently, which is equivalent to the
 * original single combined effect (the filter-parsing branch never touched
 * `items`, so splitting it out changes nothing observable).
 */
export function useInventoryFilters({
  products,
  cellars,
  lockedCategories,
  t,
  hasMounted,
}: UseInventoryFiltersOptions): UseInventoryFiltersResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategoriesState] = useState<string[]>([]);
  // #503: categories picked on the page while the URL still carried a nav category.
  const [pickedCategories, setPickedCategories] = useState<string[] | null>(null);
  const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedWineColors, setSelectedWineColors] = useState<string[]>([]);
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [sortBy, setSortBy] = useState<InventorySortBy>('default');
  const [openedFilter, setOpenedFilter] = useState<InventoryOpenedFilter>('all');
  // FEAT-101: the list shows what is in the cellar; wines with nothing left
  // stay known, hidden until "Plus en cave" asks for them (a search finds them).
  const [showGone, setShowGone] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parsing filters out of the URL query string is adjusted during render
  // (React's documented pattern) rather than in an effect, guarded against
  // the previous render's searchParams so it only re-parses when navigation
  // actually changes the query string. It starts at null so the first render
  // (arriving from another page with filters in the URL) is parsed too.
  const [prevSearchParams, setPrevSearchParams] = useState<typeof searchParams | null>(null);
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams);
    if (pickedCategories !== null) {
      // #503: the URL changed because we dropped `?category=` ourselves; only
      // the picked chips apply, the other filters stay as the member left them.
      setSelectedCategoriesState(pickedCategories);
      setPickedCategories(null);
    } else {
      const filterParam = searchParams.get('filter');
      const qParam = searchParams.get('q');
      const collectionParam = searchParams.get('collection');
      const categoryParam = searchParams.get('category');
      if (qParam) setSearchQuery(qParam);
      setSelectedCollectionId(collectionParam ?? null);
      // ISSUE_434: a category nav shortcut (Wine/Sparkling/Spirit) pre-selects
      // the category chip instead of hard-locking it (unlike `lockedCategories`,
      // which cigars uses) — the user can still broaden or clear it from the
      // same /bottles page that search results, alerts, collections and QR
      // codes all deep-link into unfiltered.
      setSelectedCategoriesState(categoryParam ? [categoryParam] : []);
      if (filterParam === 'opened') {
        setOpenedFilter('opened'); setIsFiltersOpen(true);
      } else if (filterParam === 'full') {
        setOpenedFilter('full'); setIsFiltersOpen(true);
      } else if (filterParam === 'alerts') {
        setOpenedFilter('alerts'); setIsFiltersOpen(true);
      } else {
        setOpenedFilter('all');
      }
    }
  }

  // Only a category of the navigation is the page's scope; a hand-typed
  // `?category=foo` stays an ordinary filter.
  const rawCategory = searchParams.get('category');
  const navCategory = rawCategory && CATEGORY_TITLES[rawCategory] ? rawCategory : null;

  // #503: the title, breadcrumb and active tab follow `?category=`, so they must
  // not keep saying "Wines" over a list the member has widened. Leaving the
  // nav category among the chips drops it from the URL (the page becomes the
  // plain bottles list); the picked chips survive that navigation.
  const setSelectedCategories = useCallback<React.Dispatch<React.SetStateAction<string[]>>>((value) => {
    const next = typeof value === 'function' ? value(selectedCategories) : value;
    setSelectedCategoriesState(next);
    if (navCategory && !(next.length === 1 && next[0] === navCategory)) {
      setPickedCategories(next);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('category');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [selectedCategories, navCategory, searchParams, router, pathname]);

  const toggleFilters = useCallback(() => setIsFiltersOpen((prev) => !prev), []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    // #503: a category chosen from the navigation is the page, not a filter.
    setSelectedCategoriesState(navCategory ? [navCategory] : []);
    setSelectedCellars([]);
    setSelectedTags([]);
    setSelectedWineColors([]);
    setMinValue('');
    setMaxValue('');
    setSortBy('default');
    setOpenedFilter('all');
    setShowGone(false);
    router.push(navCategory ? `${pathname}?category=${encodeURIComponent(navCategory)}` : pathname);
  }, [router, pathname, navCategory]);

  const criteria = useMemo<ProductFilterCriteria>(() => ({
    lockedCategories, selectedCollectionId, selectedCategories, selectedWineColors, selectedCellars,
    selectedTags, minValue, maxValue, openedFilter, showGone, searchQuery, sortBy,
  }), [lockedCategories, selectedCollectionId, selectedCategories, selectedWineColors, selectedCellars,
    selectedTags, minValue, maxValue, openedFilter, showGone, searchQuery, sortBy]);

  const baseItems = useMemo(() => (products ? baseProducts(products, criteria) : []), [products, criteria]);

  const filteredItems = useMemo(() => {
    if (!products) return [];
    return filterProducts(products, criteria, {
      cellarNames: new Map((cellars ?? []).map((c: Cellar) => [c.id, c.name])),
      categoryLabel: (category) => t(`categories.${category}`),
      // Guards the "alerts" filter's `new Date()` read so SSR/first paint match the client.
      today: hasMounted ? todayLocalIso() : null,
    });
  }, [products, criteria, cellars, t, hasMounted]);

  const collectionState = useMemo(() => (products ? collectionEmptiness(products, criteria) : null), [products, criteria]);

  // The navigation category alone is the page, not a filter (#503).
  const onlyNavCategory = !!navCategory && selectedCategories.length === 1 && selectedCategories[0] === navCategory;
  const hasActiveFilters =
    (selectedCategories.length > 0 && !onlyNavCategory) ||
    selectedWineColors.length > 0 ||
    selectedCellars.length > 0 ||
    openedFilter !== 'all' ||
    showGone ||
    !!searchQuery ||
    !!selectedCollectionId ||
    selectedTags.length > 0 ||
    minValue !== '' ||
    maxValue !== '' ||
    sortBy !== 'default';

  return {
    searchQuery, setSearchQuery,
    selectedCategories, setSelectedCategories,
    selectedCellars, setSelectedCellars,
    selectedCollectionId, setSelectedCollectionId,
    selectedTags, setSelectedTags,
    selectedWineColors, setSelectedWineColors,
    minValue, setMinValue,
    maxValue, setMaxValue,
    sortBy, setSortBy,
    openedFilter, setOpenedFilter,
    showGone, setShowGone,
    isFiltersOpen, toggleFilters,
    tagSearchQuery, setTagSearchQuery,
    showAllTags, setShowAllTags,
    clearFilters,
    baseItems,
    filteredItems,
    hasActiveFilters,
    navCategory,
    collectionState,
  };
}

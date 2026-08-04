'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
import type { InventorySortBy, InventoryOpenedFilter } from '@/components/inventory/InventoryFilterBar';

export interface UseInventoryFiltersOptions {
  items?: InventoryItem[];
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
  setOpenedFilter: React.Dispatch<React.SetStateAction<InventoryOpenedFilter>>;

  isFiltersOpen: boolean;
  toggleFilters: () => void;

  tagSearchQuery: string;
  setTagSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  showAllTags: boolean;
  setShowAllTags: React.Dispatch<React.SetStateAction<boolean>>;

  clearFilters: () => void;

  baseItems: InventoryItem[];
  filteredItems: InventoryItem[];
  hasActiveFilters: boolean;
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
  items,
  cellars,
  lockedCategories,
  t,
  hasMounted,
}: UseInventoryFiltersOptions): UseInventoryFiltersResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedWineColors, setSelectedWineColors] = useState<string[]>([]);
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [sortBy, setSortBy] = useState<InventorySortBy>('default');
  const [openedFilter, setOpenedFilter] = useState<InventoryOpenedFilter>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const qParam = searchParams.get('q');
    const collectionParam = searchParams.get('collection');
    if (qParam) setSearchQuery(qParam);
    setSelectedCollectionId(collectionParam ?? null);
    if (filterParam === 'opened') {
      setOpenedFilter('opened'); setIsFiltersOpen(true);
    } else if (filterParam === 'full') {
      setOpenedFilter('full'); setIsFiltersOpen(true);
    } else if (filterParam === 'alerts') {
      setOpenedFilter('alerts'); setIsFiltersOpen(true);
    } else {
      setOpenedFilter('all');
    }
  }, [searchParams]);

  const toggleFilters = useCallback(() => setIsFiltersOpen((prev) => !prev), []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedCellars([]);
    setSelectedTags([]);
    setSelectedWineColors([]);
    setMinValue('');
    setMaxValue('');
    setSortBy('default');
    setOpenedFilter('all');
    router.push(pathname);
  }, [router, pathname]);

  const baseItems = useMemo(() => {
    if (!items) return [];
    if (lockedCategories && lockedCategories.length > 0) {
      return items.filter((b: InventoryItem) => lockedCategories.includes(b.category));
    }
    return items;
  }, [items, lockedCategories]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = items;
    const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
    const norm = (s: string) => s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();

    if (lockedCategories && lockedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => lockedCategories.includes(b.category));
    }
    if (selectedCollectionId) {
      result = result.filter((b: InventoryItem) =>
        (b.collections ?? []).some(c => c.id === selectedCollectionId)
      );
    }
    if (selectedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCategories.includes(b.category));
    }
    if (selectedWineColors.length > 0) {
      result = result.filter((b: InventoryItem) =>
        b.category !== 'wine' || (!!b.color && selectedWineColors.includes(b.color))
      );
    }
    if (selectedCellars.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCellars.includes(b.cellarId || ''));
    }
    if (selectedTags.length > 0) {
      result = result.filter((b: InventoryItem) =>
        selectedTags.every((tag) => (b.tags || []).includes(tag))
      );
    }
    if (minValue !== '') {
      const min = parseFloat(minValue);
      if (!isNaN(min)) {
        result = result.filter((b: InventoryItem) => {
          const v = b.estimatedValue ?? b.purchasePrice ?? 0;
          return v >= min;
        });
      }
    }
    if (maxValue !== '') {
      const max = parseFloat(maxValue);
      if (!isNaN(max)) {
        result = result.filter((b: InventoryItem) => {
          const v = b.estimatedValue ?? b.purchasePrice ?? 0;
          return v <= max;
        });
      }
    }
    if (openedFilter === 'full') {
      result = result.filter((b: InventoryItem) => !b.isOpened);
    } else if (openedFilter === 'opened') {
      result = result.filter((b: InventoryItem) => b.isOpened);
    } else if (openedFilter === 'alerts') {
      if (!hasMounted) return [];
      const today = new Date().toISOString().split('T')[0];
      result = result.filter((b: InventoryItem) =>
        (b.reminderDate && b.reminderDate.split('T')[0] <= today) ||
        (b.alertStatus && b.alertStatus !== 'none' && !b.alertsPaused)
      );
    }
    if (searchQuery.trim()) {
      const q = norm(searchQuery);
      result = result.filter((b: InventoryItem) => {
        const cellar = cellars?.find((c: Cellar) => c.id === b.cellarId);
        const cellarName = cellar ? norm(cellar.name) : '';
        const searchStrings = [
          b.name, b.producer, b.vintage?.toString(),
          t(`categories.${b.category}`), b.region, cellarName,
          ...(b.collections ?? []).map(c => c.name),
          ...(b.tags || [])
        ].filter(Boolean) as string[];
        return searchStrings.some((s: string) => norm(s).includes(q));
      });
    }

    if (sortBy === 'value') {
      result = [...result].sort((a, b) => {
        const va = a.estimatedValue ?? a.purchasePrice ?? 0;
        const vb = b.estimatedValue ?? b.purchasePrice ?? 0;
        return vb - va;
      });
    } else if (sortBy === 'urgency') {
      const urgencyOrder: Record<string, number> = { past: 0, approaching: 1, peak: 2, none: 3 };
      result = [...result].sort((a, b) =>
        (urgencyOrder[a.alertStatus ?? 'none'] ?? 3) - (urgencyOrder[b.alertStatus ?? 'none'] ?? 3)
      );
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [items, searchQuery, selectedCategories, selectedWineColors, selectedCellars, selectedCollectionId, selectedTags, minValue, maxValue, sortBy, cellars, openedFilter, t, hasMounted, lockedCategories]);

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedWineColors.length > 0 ||
    selectedCellars.length > 0 ||
    openedFilter !== 'all' ||
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
    isFiltersOpen, toggleFilters,
    tagSearchQuery, setTagSearchQuery,
    showAllTags, setShowAllTags,
    clearFilters,
    baseItems,
    filteredItems,
    hasActiveFilters,
  };
}

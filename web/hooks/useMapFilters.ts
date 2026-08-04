'use client';
import { useState, useEffect, useCallback } from 'react';
import { InventoryCategory } from '@/lib/inventory/types';
import { MapFiltersState, DEFAULT_MAP_FILTERS } from '@/lib/analytics/mapFilters';

// FEAT-42: persist the map explorer filters across navigation, following the
// same localStorage pattern as useViewMode/usePageSize.
const STORAGE_KEY = 'analyticsMapFilters:v1';

const VALID_OPENED_STATES = ['all', 'inCellar', 'opened'];
const VALID_CATEGORIES: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

function sanitize(parsed: unknown): MapFiltersState {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_MAP_FILTERS;
  const p = parsed as Partial<MapFiltersState>;
  return {
    categories: Array.isArray(p.categories)
      ? p.categories.filter((c): c is InventoryCategory => VALID_CATEGORIES.includes(c as InventoryCategory))
      : DEFAULT_MAP_FILTERS.categories,
    priceMin: typeof p.priceMin === 'string' ? p.priceMin : DEFAULT_MAP_FILTERS.priceMin,
    priceMax: typeof p.priceMax === 'string' ? p.priceMax : DEFAULT_MAP_FILTERS.priceMax,
    vintageMin: typeof p.vintageMin === 'string' ? p.vintageMin : DEFAULT_MAP_FILTERS.vintageMin,
    vintageMax: typeof p.vintageMax === 'string' ? p.vintageMax : DEFAULT_MAP_FILTERS.vintageMax,
    minRating: typeof p.minRating === 'number' ? p.minRating : DEFAULT_MAP_FILTERS.minRating,
    openedState: VALID_OPENED_STATES.includes(p.openedState as string)
      ? (p.openedState as MapFiltersState['openedState'])
      : DEFAULT_MAP_FILTERS.openedState,
  };
}

export function useMapFilters(): [MapFiltersState, (next: MapFiltersState) => void, () => void] {
  const [filters, setFiltersState] = useState<MapFiltersState>(DEFAULT_MAP_FILTERS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Deferred to after mount rather than a lazy useState initializer:
      // localStorage isn't available during SSR, so reading it synchronously
      // in the initializer would make the client's first render diverge
      // from the server-rendered markup (hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setFiltersState(sanitize(JSON.parse(stored)));
    } catch {}
  }, []);

  const setFilters = useCallback((next: MapFiltersState) => {
    setFiltersState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_MAP_FILTERS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return [filters, setFilters, clearFilters];
}

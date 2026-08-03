import { describe, it, expect } from 'vitest';
import { InventoryItem } from '@/lib/inventory/types';
import {
  getItemMapRegion,
  hasActiveMapFilters,
  itemMatchesMapFilters,
  DEFAULT_MAP_FILTERS,
  MapFiltersState,
} from './mapFilters';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    userId: 'user-1',
    category: 'wine',
    name: 'Château Test',
    producer: 'Domaine Test',
    tags: [],
    grapeVarieties: [],
    isOpened: false,
    lockedFields: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getItemMapRegion', () => {
  it('uses region for non-cigar categories', () => {
    const item = makeItem({ category: 'wine', region: 'Bordeaux' });
    expect(getItemMapRegion(item)).toBe('Bordeaux');
  });

  it('prefers leafOrigin for cigars, falling back to region', () => {
    const cigarWithLeaf = makeItem({ category: 'cigar', leafOrigin: 'Cuba', region: 'Caraïbes' });
    expect(getItemMapRegion(cigarWithLeaf)).toBe('Cuba');

    const cigarWithoutLeaf = makeItem({ category: 'cigar', leafOrigin: null, region: 'Caraïbes' });
    expect(getItemMapRegion(cigarWithoutLeaf)).toBe('Caraïbes');
  });

  it('returns null for blank/missing region (error case)', () => {
    expect(getItemMapRegion(makeItem({ region: null }))).toBeNull();
    expect(getItemMapRegion(makeItem({ region: '   ' }))).toBeNull();
  });
});

describe('hasActiveMapFilters', () => {
  it('is false for the default filter shape', () => {
    expect(hasActiveMapFilters(DEFAULT_MAP_FILTERS)).toBe(false);
  });

  it('is true when any single field diverges from the default', () => {
    expect(hasActiveMapFilters({ ...DEFAULT_MAP_FILTERS, categories: ['wine'] })).toBe(true);
    expect(hasActiveMapFilters({ ...DEFAULT_MAP_FILTERS, minRating: 3 })).toBe(true);
    expect(hasActiveMapFilters({ ...DEFAULT_MAP_FILTERS, openedState: 'opened' })).toBe(true);
  });
});

describe('itemMatchesMapFilters', () => {
  const noRatings = new Map<string, number>();

  it('matches everything with default filters and no region scope (nominal case)', () => {
    const item = makeItem();
    expect(itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, null)).toBe(true);
  });

  it('excludes items outside the region scope from a marker click', () => {
    const item = makeItem({ region: 'Bourgogne' });
    expect(itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, 'Bordeaux')).toBe(false);
    expect(itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, 'Bourgogne')).toBe(true);
  });

  it('filters by category multi-select', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, categories: ['spirit', 'cigar'] };
    expect(itemMatchesMapFilters(makeItem({ category: 'wine' }), filters, noRatings, null)).toBe(false);
    expect(itemMatchesMapFilters(makeItem({ category: 'spirit' }), filters, noRatings, null)).toBe(true);
  });

  it('filters by price range, excluding items with no price data (error/edge case)', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, priceMin: '20', priceMax: '100' };
    expect(itemMatchesMapFilters(makeItem({ estimatedValue: 50 }), filters, noRatings, null)).toBe(true);
    expect(itemMatchesMapFilters(makeItem({ estimatedValue: 10 }), filters, noRatings, null)).toBe(false);
    expect(itemMatchesMapFilters(makeItem({ estimatedValue: 200 }), filters, noRatings, null)).toBe(false);
    expect(itemMatchesMapFilters(makeItem(), filters, noRatings, null)).toBe(false);
  });

  it('filters by vintage range', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, vintageMin: '2015', vintageMax: '2020' };
    expect(itemMatchesMapFilters(makeItem({ vintage: 2018 }), filters, noRatings, null)).toBe(true);
    expect(itemMatchesMapFilters(makeItem({ vintage: 2010 }), filters, noRatings, null)).toBe(false);
    expect(itemMatchesMapFilters(makeItem({ vintage: null }), filters, noRatings, null)).toBe(false);
  });

  it('filters by best-effort rating map, excluding unrated items', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, minRating: 4 };
    const ratings = new Map<string, number>([['rated-high', 4.5], ['rated-low', 2]]);
    expect(itemMatchesMapFilters(makeItem({ id: 'rated-high' }), filters, ratings, null)).toBe(true);
    expect(itemMatchesMapFilters(makeItem({ id: 'rated-low' }), filters, ratings, null)).toBe(false);
    expect(itemMatchesMapFilters(makeItem({ id: 'unrated' }), filters, ratings, null)).toBe(false);
  });

  it('filters by opened state', () => {
    const inCellarOnly: MapFiltersState = { ...DEFAULT_MAP_FILTERS, openedState: 'inCellar' };
    expect(itemMatchesMapFilters(makeItem({ isOpened: false }), inCellarOnly, noRatings, null)).toBe(true);
    expect(itemMatchesMapFilters(makeItem({ isOpened: true }), inCellarOnly, noRatings, null)).toBe(false);

    const openedOnly: MapFiltersState = { ...DEFAULT_MAP_FILTERS, openedState: 'opened' };
    expect(itemMatchesMapFilters(makeItem({ isOpened: true }), openedOnly, noRatings, null)).toBe(true);
    expect(itemMatchesMapFilters(makeItem({ isOpened: false }), openedOnly, noRatings, null)).toBe(false);
  });
});

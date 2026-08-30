import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import {
  getItemMapRegion,
  hasActiveMapFilters,
  itemMatchesMapFilters,
  DEFAULT_MAP_FILTERS,
  MapFiltersState,
} from './mapFilters';

const CATEGORIES: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

const itemArb: fc.Arbitrary<InventoryItem> = fc.record({
  id: fc.uuid(),
  userId: fc.constant('u1'),
  category: fc.constantFrom(...CATEGORIES),
  name: fc.string(),
  producer: fc.string(),
  tags: fc.constant([]),
  grapeVarieties: fc.constant([]),
  lockedFields: fc.constant([]),
  isOpened: fc.boolean(),
  createdAt: fc.constant('2024-01-01T00:00:00.000Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
  region: fc.option(fc.string(), { nil: null }),
  leafOrigin: fc.option(fc.string(), { nil: null }),
  vintage: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: null }),
  estimatedValue: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  purchasePrice: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
}) as unknown as fc.Arbitrary<InventoryItem>;

const noRatings = new Map<string, number>();

describe('itemMatchesMapFilters — properties', () => {
  it('every item matches the default filters when there is no region scope', () => {
    fc.assert(
      fc.property(itemArb, (item) => {
        expect(itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, null)).toBe(true);
      }),
    );
  });

  it('is idempotent (pure)', () => {
    fc.assert(
      fc.property(itemArb, fc.constantFrom(...CATEGORIES), (item, cat) => {
        const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, categories: [cat] };
        const a = itemMatchesMapFilters(item, filters, noRatings, null);
        const b = itemMatchesMapFilters(item, filters, noRatings, null);
        expect(a).toBe(b);
      }),
    );
  });

  it('a category filter never matches an item of a different category', () => {
    fc.assert(
      fc.property(itemArb, (item) => {
        const others = CATEGORIES.filter((c) => c !== item.category);
        expect(itemMatchesMapFilters(item, { ...DEFAULT_MAP_FILTERS, categories: others }, noRatings, null)).toBe(false);
      }),
    );
  });

  it('a matched item under a region scope always sits in that exact region', () => {
    fc.assert(
      fc.property(itemArb, fc.string({ minLength: 1 }), (item, region) => {
        if (itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, region)) {
          expect(getItemMapRegion(item)).toBe(region);
        }
      }),
    );
  });

  it('adding a price floor can only ever remove matches, never add them', () => {
    fc.assert(
      fc.property(itemArb, fc.integer({ min: 1, max: 10_000 }), (item, floor) => {
        const before = itemMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, null);
        const after = itemMatchesMapFilters(
          item,
          { ...DEFAULT_MAP_FILTERS, priceMin: String(floor) },
          noRatings,
          null,
        );
        // after ⇒ before  (monotone tightening)
        expect(!after || before).toBe(true);
      }),
    );
  });
});

describe('hasActiveMapFilters', () => {
  it('is false only for the exact default shape', () => {
    expect(hasActiveMapFilters(DEFAULT_MAP_FILTERS)).toBe(false);
  });

  it('is true whenever any single field diverges from the default', () => {
    const divergences: Partial<MapFiltersState>[] = [
      { categories: ['wine'] },
      { priceMin: '10' },
      { priceMax: '10' },
      { vintageMin: '2000' },
      { vintageMax: '2000' },
      { minRating: 1 },
      { openedState: 'opened' },
      { openedState: 'inCellar' },
    ];
    for (const d of divergences) {
      expect(hasActiveMapFilters({ ...DEFAULT_MAP_FILTERS, ...d })).toBe(true);
    }
  });
});

describe('getItemMapRegion', () => {
  const asItem = (o: object) => o as unknown as InventoryItem;

  it('returns null for blank/whitespace regions, a trimmed value otherwise', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (region) => {
        const result = getItemMapRegion(asItem({ category: 'wine', region }));
        if (result !== null) {
          expect(result).toBe(result.trim());
          expect(result.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('prefers leafOrigin for cigars, falling back to region', () => {
    expect(getItemMapRegion(asItem({ category: 'cigar', leafOrigin: 'Cuba', region: 'X' }))).toBe('Cuba');
    expect(getItemMapRegion(asItem({ category: 'cigar', leafOrigin: null, region: 'X' }))).toBe('X');
  });
});

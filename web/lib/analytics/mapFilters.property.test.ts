import { describe, it, expect } from 'vitest';
import { normalizeRegionName } from '@shared/map-location';
import fc from 'fast-check';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { product, unit } from '@/lib/products/__tests__/factories';
import {
  getProductMapRegion,
  hasActiveMapFilters,
  productMatchesMapFilters,
  DEFAULT_MAP_FILTERS,
  MapFiltersState,
} from './mapFilters';

const CATEGORIES: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

const itemArb: fc.Arbitrary<Product> = fc.record({
  id: fc.uuid(),
  category: fc.constantFrom(...CATEGORIES),
  name: fc.string(),
  isOpened: fc.boolean(),
  region: fc.option(fc.string(), { nil: null }),
  leafOrigin: fc.option(fc.string(), { nil: null }),
  vintage: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: null }),
  estimatedValue: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  purchasePrice: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
}).map(({ isOpened, estimatedValue, purchasePrice, ...description }) =>
  product({ ...description, items: [unit({ isOpened, fillLevel: isOpened ? 50 : null, estimatedValue, purchasePrice })] }));

const noRatings = new Map<string, number>();

describe('productMatchesMapFilters — properties', () => {
  it('every wine in stock matches the default filters when there is no region scope', () => {
    fc.assert(
      fc.property(itemArb, (item) => {
        expect(productMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, null)).toBe(true);
      }),
    );
  });

  it('is idempotent (pure)', () => {
    fc.assert(
      fc.property(itemArb, fc.constantFrom(...CATEGORIES), (item, cat) => {
        const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, categories: [cat] };
        const a = productMatchesMapFilters(item, filters, noRatings, null);
        const b = productMatchesMapFilters(item, filters, noRatings, null);
        expect(a).toBe(b);
      }),
    );
  });

  it('a category filter never matches an item of a different category', () => {
    fc.assert(
      fc.property(itemArb, (item) => {
        const others = CATEGORIES.filter((c) => c !== item.category);
        expect(productMatchesMapFilters(item, { ...DEFAULT_MAP_FILTERS, categories: others }, noRatings, null)).toBe(false);
      }),
    );
  });

  // #961: a region is one place whatever its case, spaces or accents.
  it('a matched item under a region scope always sits in that region, spelt one way or another', () => {
    fc.assert(
      fc.property(itemArb, fc.string({ minLength: 1 }), (item, region) => {
        if (productMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, region)) {
          expect(normalizeRegionName(getProductMapRegion(item) ?? '')).toBe(normalizeRegionName(region));
        }
      }),
    );
  });

  it('adding a price floor can only ever remove matches, never add them', () => {
    fc.assert(
      fc.property(itemArb, fc.integer({ min: 1, max: 10_000 }), (item, floor) => {
        const before = productMatchesMapFilters(item, DEFAULT_MAP_FILTERS, noRatings, null);
        const after = productMatchesMapFilters(
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

describe('getProductMapRegion', () => {
  const asItem = (o: Partial<Product>) => product(o);

  it('returns null for blank/whitespace regions, a trimmed value otherwise', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (region) => {
        const result = getProductMapRegion(asItem({ category: 'wine', region }));
        if (result !== null) {
          expect(result).toBe(result.trim());
          expect(result.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('prefers leafOrigin for cigars, falling back to region', () => {
    expect(getProductMapRegion(asItem({ category: 'cigar', leafOrigin: 'Cuba', region: 'X' }))).toBe('Cuba');
    expect(getProductMapRegion(asItem({ category: 'cigar', leafOrigin: null, region: 'X' }))).toBe('X');
  });
});

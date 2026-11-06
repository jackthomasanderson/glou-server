import { describe, it, expect } from 'vitest';
import { product, unit, openedBottle } from '@/lib/products/__tests__/factories';
import {
  getProductMapRegion,
  hasActiveMapFilters,
  productMatchesMapFilters,
  DEFAULT_MAP_FILTERS,
  MapFiltersState,
} from './mapFilters';

describe('getProductMapRegion', () => {
  it('uses region for non-cigar categories', () => {
    expect(getProductMapRegion(product({ category: 'wine', region: 'Bordeaux' }))).toBe('Bordeaux');
  });

  it('prefers leafOrigin for cigars, falling back to region', () => {
    expect(getProductMapRegion(product({ category: 'cigar', leafOrigin: 'Cuba', region: 'Caraïbes' }))).toBe('Cuba');
    expect(getProductMapRegion(product({ category: 'cigar', leafOrigin: null, region: 'Caraïbes' }))).toBe('Caraïbes');
  });

  it('returns null for blank/missing region (error case)', () => {
    expect(getProductMapRegion(product({ region: null }))).toBeNull();
    expect(getProductMapRegion(product({ region: '   ' }))).toBeNull();
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

describe('productMatchesMapFilters', () => {
  const noRatings = new Map<string, number>();
  const matches = (p = product(), filters: MapFiltersState = DEFAULT_MAP_FILTERS, ratings = noRatings, region: string | null = null) =>
    productMatchesMapFilters(p, filters, ratings, region);

  it('matches a wine in stock with default filters and no region scope (nominal case)', () => {
    expect(matches()).toBe(true);
  });

  // Recette n°5 ter of #847: a wine drunk to its last bottle was listed once per bottle drunk.
  it('leaves out a wine with nothing left in the cellar (drunk, written off, trashed, or known without bottle)', () => {
    const drunk = product({ items: [openedBottle(0), openedBottle(0), openedBottle(0)] });
    const writtenOff = product({ items: [unit({ writtenOffAt: '2026-03-01T00:00:00.000Z' })] });
    const trashed = product({ items: [unit({ deletedAt: '2026-03-01T00:00:00.000Z' })] });
    const tastedOnly = product({ items: [] });
    for (const p of [drunk, writtenOff, trashed, tastedOnly]) expect(matches(p)).toBe(false);
    // One bottle left among the drunk ones: the wine is in stock.
    expect(matches(product({ items: [openedBottle(0), unit({ quantity: 8 })] }))).toBe(true);
  });

  it('excludes wines outside the region scope from a marker click', () => {
    const p = product({ region: 'Bourgogne' });
    expect(matches(p, DEFAULT_MAP_FILTERS, noRatings, 'Bordeaux')).toBe(false);
    expect(matches(p, DEFAULT_MAP_FILTERS, noRatings, 'Bourgogne')).toBe(true);
  });

  it('filters by category multi-select', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, categories: ['spirit', 'cigar'] };
    expect(matches(product({ category: 'wine' }), filters)).toBe(false);
    expect(matches(product({ category: 'spirit' }), filters)).toBe(true);
  });

  it('filters by the price of a bottle in stock, excluding wines with no price data (error/edge case)', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, priceMin: '20', priceMax: '100' };
    expect(matches(product({ items: [unit({ estimatedValue: 50 })] }), filters)).toBe(true);
    expect(matches(product({ items: [unit({ purchasePrice: 30 })] }), filters)).toBe(true);
    expect(matches(product({ items: [unit({ estimatedValue: 10 })] }), filters)).toBe(false);
    expect(matches(product({ items: [unit({ estimatedValue: 200 })] }), filters)).toBe(false);
    expect(matches(product({ items: [unit()] }), filters)).toBe(false);
    // Any bottle in stock within the range is enough; a drunk one is not read.
    expect(matches(product({ items: [unit({ estimatedValue: 10 }), unit({ estimatedValue: 60 })] }), filters)).toBe(true);
    expect(matches(product({ items: [openedBottle(0, { estimatedValue: 60 }), unit({ estimatedValue: 10 })] }), filters)).toBe(false);
  });

  it('filters by vintage range', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, vintageMin: '2015', vintageMax: '2020' };
    expect(matches(product({ vintage: 2018 }), filters)).toBe(true);
    expect(matches(product({ vintage: 2010 }), filters)).toBe(false);
    expect(matches(product({ vintage: null }), filters)).toBe(false);
  });

  it('filters by best-effort rating map of the wine, excluding unrated wines', () => {
    const filters: MapFiltersState = { ...DEFAULT_MAP_FILTERS, minRating: 4 };
    const ratings = new Map<string, number>([['rated-high', 4.5], ['rated-low', 2]]);
    expect(matches(product({ id: 'rated-high' }), filters, ratings)).toBe(true);
    expect(matches(product({ id: 'rated-low' }), filters, ratings)).toBe(false);
    expect(matches(product({ id: 'unrated' }), filters, ratings)).toBe(false);
  });

  it('filters by opened state of the bottles in stock', () => {
    const closed = product({ items: [unit({ quantity: 3 })] });
    const opened = product({ items: [openedBottle(50)] });
    const both = product({ items: [unit(), openedBottle(50)] });
    const closedAndDrunk = product({ items: [unit(), openedBottle(0)] });

    const inCellarOnly: MapFiltersState = { ...DEFAULT_MAP_FILTERS, openedState: 'inCellar' };
    expect(matches(closed, inCellarOnly)).toBe(true);
    expect(matches(opened, inCellarOnly)).toBe(false);
    expect(matches(both, inCellarOnly)).toBe(true);

    const openedOnly: MapFiltersState = { ...DEFAULT_MAP_FILTERS, openedState: 'opened' };
    expect(matches(opened, openedOnly)).toBe(true);
    expect(matches(closed, openedOnly)).toBe(false);
    expect(matches(both, openedOnly)).toBe(true);
    // A finished bottle is no longer in the cellar: it does not make the wine "opened".
    expect(matches(closedAndDrunk, openedOnly)).toBe(false);
  });
});

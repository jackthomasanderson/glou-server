import { describe, expect, it } from 'vitest';
import { filterProducts, type ProductFilterContext, type ProductFilterCriteria } from '../filters';
import { openedBottle, product, unit } from './factories';

// #471 — the list of wines: "Plus en cave" (FEAT-101 c1-c2), cellar filter (FEAT-96 c3).

const criteria = (over: Partial<ProductFilterCriteria> = {}): ProductFilterCriteria => ({
  selectedCollectionId: null, selectedCategories: [], selectedWineColors: [], selectedCellars: [],
  selectedTags: [], minValue: '', maxValue: '', openedFilter: 'all', showGone: false, searchQuery: '',
  sortBy: 'default', ...over,
});
const ctx: ProductFilterContext = { cellarNames: new Map([['garage', 'Garage'], ['kitchen', 'Cuisine']]), categoryLabel: (c: string) => c, today: '2026-10-31' };

const inStock = product({ id: 'stock', name: 'Cuvée X', items: [unit({ quantity: 7, cellarId: 'garage', purchasePrice: 20 }), unit({ quantity: 2, cellarId: 'kitchen', purchasePrice: 20 })] });
const gone = product({ id: 'gone', name: 'Grand Vin Bu', items: [] });
const opened = product({ id: 'opened', name: 'Entamé', items: [openedBottle(60, { cellarId: 'garage', estimatedValue: 80 })] });
const all = [inStock, gone, opened];
const ids = (over: Partial<ProductFilterCriteria>, list = all, context = ctx) => filterProducts(list, criteria(over), context).map((p) => p.id);

describe('filterProducts — wines with nothing left (FEAT-101)', () => {
  it('hides them by default', () => {
    expect(ids({})).toEqual(['stock', 'opened']);
  });

  it('"Plus en cave" shows them, and only them', () => {
    expect(ids({ showGone: true })).toEqual(['gone']);
  });

  it('the search always finds them, filter on or not', () => {
    expect(ids({ searchQuery: 'grand vin' })).toEqual(['gone']);
    expect(ids({ searchQuery: 'GRAND', showGone: true })).toEqual(['gone']);
  });

  it('a wine whose bottles are all trashed is not "Plus en cave"', () => {
    // The API leaves it out of the list (D10); the trashed bottles never count.
    const trashed = product({ id: 'trashed', items: [unit({ deletedAt: '2026-10-01T00:00:00.000Z' })] });
    expect(ids({}, [trashed])).toEqual([]);
  });
});

describe('filterProducts — other filters on wines', () => {
  it('a cellar filter keeps a wine with some of its bottles there', () => {
    expect(ids({ selectedCellars: ['kitchen'] })).toEqual(['stock']);
    expect(ids({ selectedCellars: ['garage'] })).toEqual(['stock', 'opened']);
  });

  it('the search reads the cellars of its bottles', () => {
    expect(ids({ searchQuery: 'cuisine' })).toEqual(['stock']);
  });

  it('"full" and "opened" read the stock of the wine', () => {
    expect(ids({ openedFilter: 'full' })).toEqual(['stock']);
    expect(ids({ openedFilter: 'opened' })).toEqual(['opened']);
  });

  it('"alerts": no drinking-window alert once gone, a due reminder still shows', () => {
    const list = [
      product({ id: 'peak', alertStatus: 'peak' }),
      product({ id: 'gone-peak', alertStatus: 'peak', items: [] }),
      product({ id: 'gone-reminder', reminderDate: '2026-01-01', items: [] }),
      product({ id: 'paused', alertStatus: 'past', alertsPaused: true }),
    ];
    expect(ids({ openedFilter: 'alerts', showGone: false }, list)).toEqual(['peak']);
    expect(ids({ openedFilter: 'alerts', showGone: true }, list)).toEqual(['gone-reminder']);
    expect(ids({ openedFilter: 'alerts' }, list, { ...ctx, today: null })).toEqual([]);
  });

  it('the value range reads the value of one bottle', () => {
    expect(ids({ minValue: '50' })).toEqual(['opened']);
    expect(ids({ maxValue: '25' })).toEqual(['stock']);
  });

  it('sorts by the value of the stock', () => {
    // Cuvée X: 9 × 20 € = 180 €; the opened bottle: 80 €.
    expect(ids({ sortBy: 'value' })).toEqual(['stock', 'opened']);
  });
});

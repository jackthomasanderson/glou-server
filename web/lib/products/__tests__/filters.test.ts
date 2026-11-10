import { describe, expect, it } from 'vitest';
import { collectionEmptiness, filterProducts, NO_CELLAR, type ProductFilterContext, type ProductFilterCriteria } from '../filters';
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

  it('#707: "Sans cave" keeps a wine with some bottles left without a cellar', () => {
    const homeless = product({ id: 'homeless', items: [unit({ cellarId: null })] });
    expect(ids({ selectedCellars: [NO_CELLAR] }, [...all, homeless])).toEqual(['homeless']);
    expect(ids({ selectedCellars: [NO_CELLAR, 'kitchen'] }, [...all, homeless])).toEqual(['stock', 'homeless']);
  });

  it('the search reads the cellars of its bottles', () => {
    expect(ids({ searchQuery: 'cuisine' })).toEqual(['stock']);
  });

  it('"full" and "opened" read the stock of the wine', () => {
    expect(ids({ openedFilter: 'full' })).toEqual(['stock']);
    expect(ids({ openedFilter: 'opened' })).toEqual(['opened']);
  });

  it('"alerts": a wine with nothing left shows neither its alert nor its due reminder', () => {
    const list = [
      product({ id: 'peak', alertStatus: 'peak' }),
      product({ id: 'gone-peak', alertStatus: 'peak', items: [] }),
      product({ id: 'gone-reminder', reminderDate: '2026-01-01', items: [] }),
      product({ id: 'paused', alertStatus: 'past', alertsPaused: true }),
    ];
    expect(ids({ openedFilter: 'alerts', showGone: false }, list)).toEqual(['peak']);
    expect(ids({ openedFilter: 'alerts', showGone: true }, list)).toEqual([]);
    expect(ids({ openedFilter: 'alerts' }, [product({ id: 'due', reminderDate: '2026-01-01' })])).toEqual(['due']);
    expect(ids({ openedFilter: 'alerts' }, list, { ...ctx, today: null })).toEqual([]);
  });

  it('#644: "alerts" keeps due reminders and wines at or past their peak, not the ones still approaching', () => {
    const list = [
      product({ id: 'approaching', alertStatus: 'approaching' }),
      product({ id: 'peak', alertStatus: 'peak' }),
      product({ id: 'past', alertStatus: 'past' }),
      product({ id: 'none', alertStatus: 'none' }),
      product({ id: 'approaching-due', alertStatus: 'approaching', reminderDate: '2026-10-31' }),
      product({ id: 'reminder-later', reminderDate: '2026-11-01' }),
    ];
    expect(ids({ openedFilter: 'alerts' }, list)).toEqual(['peak', 'past', 'approaching-due']);
  });

  it('#644: the "urgency" sort lists past, then peak, then approaching, then the rest', () => {
    const list = [
      product({ id: 'none', alertStatus: 'none' }),
      product({ id: 'approaching', alertStatus: 'approaching' }),
      product({ id: 'unknown', alertStatus: null }),
      product({ id: 'peak', alertStatus: 'peak' }),
      product({ id: 'past', alertStatus: 'past' }),
    ];
    expect(ids({ sortBy: 'urgency' }, list)).toEqual(['past', 'peak', 'approaching', 'none', 'unknown']);
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

// #708: a collection with nothing to show gets its own empty state.
describe('collectionEmptiness', () => {
  const inColl = (p: typeof inStock) => ({ ...p, collections: [{ id: 'c1', name: 'Cadeaux' }] }) as typeof inStock;

  it('says nothing without a collection chosen', () => {
    expect(collectionEmptiness(all, criteria())).toBeNull();
  });

  it('a collection holding no wine is empty, whatever the other filters', () => {
    expect(collectionEmptiness(all, criteria({ selectedCollectionId: 'c1' }))).toBe('empty');
    expect(collectionEmptiness(all, criteria({ selectedCollectionId: 'c1', searchQuery: 'x' }))).toBe('empty');
  });

  it('a collection whose wines are all finished has nothing left', () => {
    expect(collectionEmptiness([inStock, inColl(gone)], criteria({ selectedCollectionId: 'c1' }))).toBe('allGone');
  });

  it('…unless "Plus en cave" or a search, which show finished wines, is on', () => {
    expect(collectionEmptiness([inColl(gone)], criteria({ selectedCollectionId: 'c1', showGone: true }))).toBeNull();
    expect(collectionEmptiness([inColl(gone)], criteria({ selectedCollectionId: 'c1', searchQuery: 'zz' }))).toBeNull();
  });

  it('a collection with a wine in stock is not empty: other filters may hide it', () => {
    expect(collectionEmptiness([inColl(inStock), inColl(gone)], criteria({ selectedCollectionId: 'c1' }))).toBeNull();
  });
});

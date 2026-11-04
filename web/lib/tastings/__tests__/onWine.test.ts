import { describe, it, expect } from 'vitest';
import type { ProductItem } from '@/lib/products/types';
import { isTastedElsewhere, parseYear, tastedWineTitle, tastingLinePreset, tastingPayload, wineOptionLabel } from '../onWine';

const line = (id: string, fields: Partial<ProductItem> = {}) =>
  ({ id, isOpened: false, fillLevel: null, cigarsLeft: null, ...fields }) as ProductItem;

describe('tastingLinePreset (§10.4: no question when the answer is obvious)', () => {
  it('keeps the bottle given while it is in the cellar', () => {
    expect(tastingLinePreset([line('a'), line('b')], 'b')?.id).toBe('b');
  });

  it('else the opened bottle, the one being drunk', () => {
    expect(tastingLinePreset([line('a'), line('b'), line('o', { isOpened: true, fillLevel: 40 })])?.id).toBe('o');
  });

  it('else the only line, and none among several full lines', () => {
    expect(tastingLinePreset([line('a')])?.id).toBe('a');
    expect(tastingLinePreset([line('a'), line('b')])).toBeUndefined();
    expect(tastingLinePreset([])).toBeUndefined();
  });
});

describe('tastingPayload', () => {
  const fields = { rating: 4, notes: 'Good' };

  it('a bottle of the cellar: the wine and the bottle', () => {
    expect(tastingPayload({ ...fields, productId: 'p', itemId: 'b' }, { kind: 'listed', onBottle: true }))
      .toEqual({ ...fields, productId: 'p', itemId: 'b' });
  });

  it('tasted elsewhere: the wine only, the bottle once chosen dropped', () => {
    expect(tastingPayload({ ...fields, productId: 'p', itemId: 'b' }, { kind: 'listed', onBottle: false }))
      .toEqual({ ...fields, productId: 'p' });
  });

  it('a wine named: its name only, what its category keeps', () => {
    expect(tastingPayload(
      { ...fields, productId: 'p', itemId: 'b', wine: { category: 'wine', producer: ' X ', name: ' Y ', vintage: 2020, format: 'z' } },
      { kind: 'named' },
    )).toEqual({ ...fields, wine: { category: 'wine', producer: 'X', name: 'Y', vintage: 2020 } });
    expect(tastingPayload(
      { wine: { category: 'cigar', producer: 'Cohiba', name: 'Siglo', vintage: 2020, format: ' Robusto ' } },
      { kind: 'named' },
    )).toEqual({ wine: { category: 'cigar', producer: 'Cohiba', name: 'Siglo', format: 'Robusto' } });
    expect(tastingPayload({ wine: { category: 'spirit', producer: 'X', name: 'Y', vintage: 2020 } }, { kind: 'named' }))
      .toEqual({ wine: { category: 'spirit', producer: 'X', name: 'Y' } });
  });

  it('an edit never changes the wine', () => {
    expect(tastingPayload({ ...fields, productId: 'p', itemId: 'b', wine: { category: 'wine', producer: 'X', name: 'Y' } }, { kind: 'edit' }))
      .toEqual({ ...fields, itemId: 'b' });
  });
});

describe('labels', () => {
  it('names a wine with its vintage, a cigar with its vitola', () => {
    expect(wineOptionLabel({ name: 'Talbot', producer: 'Château Talbot', vintage: 2015, format: null, category: 'wine' }))
      .toBe('Talbot — Château Talbot (2015)');
    expect(wineOptionLabel({ name: 'Siglo VI', producer: 'Cohiba', vintage: null, format: 'Robusto', category: 'cigar' }))
      .toBe('Siglo VI — Cohiba · Robusto');
  });

  it('titles a tasting by its wine, a tasting elsewhere included', () => {
    const wine = { id: 'p', name: 'A', producer: 'X', category: 'wine' as const };
    expect(tastedWineTitle({ product: wine, item: null })).toBe('A — X');
    expect(tastedWineTitle({ product: null, item: null })).toBeNull();
    expect(isTastedElsewhere({ itemId: null, productId: 'p' })).toBe(true);
    expect(isTastedElsewhere({ itemId: 'b', productId: 'p' })).toBe(false);
  });

  it('reads a year typed', () => {
    expect(parseYear(' 2020 ')).toBe(2020);
    expect(parseYear('20')).toBeNull();
    expect(parseYear('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { historyNounOf } from '../stockActions';

// Review of #871: a box no longer in stock (finished, broken, merged away)
// was named a single cigar in its history (« Cigare entamé »).
describe('historyNounOf', () => {
  const items = [{ id: 'inStockBox', cigarsPerBox: 25 }, { id: 'singles', cigarsPerBox: null }];
  const history = [
    { itemId: 'goneBox', changes: [{ field: 'isOpened', from: false, to: true }, { field: 'cigarsLeft', from: null, to: 24 }] },
    { itemId: 'goneSingle', changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }] },
  ];

  it('a line in stock: its own size', () => {
    const noun = historyNounOf(items, history, 'cigar');
    expect(noun('inStockBox')).toBe('box');
    expect(noun('singles')).toBe('cigar');
  });

  it('a line gone: a box if its entries told cigars left, else a cigar', () => {
    const noun = historyNounOf(items, history, 'cigar');
    expect(noun('goneBox')).toBe('box');
    expect(noun('goneSingle')).toBe('cigar');
    expect(noun(null)).toBe('cigar');
  });

  it('a wine is always bottles', () => {
    expect(historyNounOf([], history, 'bottle')('goneBox')).toBe('bottle');
  });
});

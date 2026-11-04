import { describe, it, expect } from 'vitest';
import { drinkChoices, drinkRequest, unitsInStock, winesInStock } from '../bulk';
import { openedBottle, product, unit } from './factories';

// #471 (FEAT-111): what the bulk dialogs say and send for the wines selected.

const six = product({ id: 'six', items: [unit({ quantity: 5 }), openedBottle(60, { productId: 'six' })] });
const one = product({ id: 'one', items: [unit({ quantity: 1 })] });
const gone = product({ id: 'gone', items: [] });
const cigars = product({ id: 'cig', category: 'cigar', items: [unit({ quantity: 2, cigarsPerBox: 25 })] });

describe('bulk actions on wines (FEAT-111)', () => {
  it('c1/c4: the summary counts the bottles in the cellar of the wines selected, never a wine without any', () => {
    const selected = new Set(['six', 'one', 'gone']);
    expect(winesInStock([six, one, gone, cigars], selected).map((p) => p.id)).toEqual(['six', 'one']);
    expect(unitsInStock([six, one, gone, cigars], selected)).toBe(7);
    expect(unitsInStock([cigars], new Set(['cig']))).toBe(50);
  });

  it('c3: each wine is asked how many (1 by default), its opened bottle proposed first', () => {
    const choices = drinkChoices([six, one], new Set(['six', 'one']));
    expect(choices.map((c) => [c.product.id, c.units, c.opened?.fillLevel ?? null])).toEqual([['six', 6, 60], ['one', 1, null]]);
    expect(drinkRequest(choices, {})).toEqual({
      action: 'drink',
      items: [{ productId: 'six', count: 1, openedFirst: true }, { productId: 'one', count: 1, openedFirst: true }],
    });
  });

  it('keeps the answer within the stock, and passes the cellars looked at', () => {
    const choices = drinkChoices([six], new Set(['six']));
    expect(drinkRequest(choices, { six: { count: 9, openedFirst: false } }, ['c1'])).toEqual({
      action: 'drink', items: [{ productId: 'six', count: 6, openedFirst: false }], cellarIds: ['c1'],
    });
  });
});

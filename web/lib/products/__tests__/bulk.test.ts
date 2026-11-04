import { beforeAll, describe, it, expect } from 'vitest';
import { bulkSummary, bulkWineNames, drinkChoices, drinkRequest, unitsAlreadyIn, unitsInStock, winesInStock } from '../bulk';
import { frenchT } from './i18n';
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

describe('bulkSummary (FEAT-111, review of #821)', () => {
  let t: Awaited<ReturnType<typeof frenchT>>;
  beforeAll(async () => { t = await frenchT(); });

  it('counts only the wines still in the cellar, as the dialogs do: a « Plus en cave » wine selected is left out', () => {
    expect(bulkSummary([six, one, gone], new Set(['six', 'one', 'gone']), false, t)).toBe('2 vins, 7 bouteilles');
  });

  it('says « références » and « cigares » on the cigars page', () => {
    expect(bulkSummary([cigars], new Set(['cig']), true, t)).toBe('1 référence, 50 cigares');
  });
});

// Recette #471: the summary names the wines, and a move says what is already there.
describe('bulk recap names the wines and what a move leaves (recette #471)', () => {
  let t: Awaited<ReturnType<typeof frenchT>>;
  beforeAll(async () => { t = await frenchT(); });

  it('names the wines in the cellar, three at most then how many more', () => {
    const named = (id: string, name: string) => product({ id, name, vintage: null, items: [unit({ quantity: 1 })] });
    const wines = [named('a', 'ZZ Recette B'), named('b', 'Beta'), named('c', 'Gamma'), named('d', 'Delta'), gone];
    expect(bulkWineNames(wines, new Set(['a']), t)).toBe('ZZ Recette B');
    expect(bulkWineNames(wines, new Set(['a', 'b', 'gone']), t)).toBe('ZZ Recette B, Beta');
    expect(bulkWineNames(wines, new Set(['a', 'b', 'c', 'd']), t)).toBe('ZZ Recette B, Beta, Gamma et 1 autre');
  });

  it('a move counts the bottles already in the cellar chosen: they stay where they are', () => {
    const spread = product({ id: 'spread', items: [unit({ quantity: 9, cellarId: 'a' }), unit({ quantity: 2, cellarId: 'b' }), openedBottle(50, { cellarId: null })] });
    const selected = new Set(['spread']);
    expect(unitsAlreadyIn([spread], selected, 'b')).toBe(2);
    expect(unitsAlreadyIn([spread], selected, null)).toBe(1);
    expect(unitsAlreadyIn([spread], selected, 'elsewhere')).toBe(0);
  });
});

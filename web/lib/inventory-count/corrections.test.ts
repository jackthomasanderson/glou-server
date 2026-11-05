import { describe, it, expect } from 'vitest';
import { buildCorrections, defaultFindChoice, missingChoices } from './corrections';
import type { CountLine, CountUnexpectedItem } from './types';

// #471 (FEAT-100): the choices offered for the missing copies of a line,
// and the corrections they send at closure.

const line = (extra: Partial<CountLine>): CountLine => ({
  id: 'g1', productId: 'p1', name: 'Talbot', producer: 'Domaine', category: 'wine', vintage: 2015, photoUrl: null, cellarId: 'c1',
  isGroup: true, expectedQuantity: 6, foundQuantity: 4, missingQuantity: 2, surplusQuantity: 0, ...extra,
});

const find = (matching: string[]): CountUnexpectedItem => ({
  entryId: 'f1', itemId: null, name: 'Talbot', producer: null, category: 'wine', vintage: null, photoUrl: null, cellarId: null,
  quantity: 6, scannedAt: '2026-10-31T00:00:00.000Z',
  matchingProducts: matching.map((id) => ({ id, name: 'Talbot', producer: 'Domaine', vintage: 2015 })),
});

describe('missingChoices', () => {
  it('offers "drunk" and both reasons of "correct the number" for a group partly found', () => {
    expect(missingChoices(line({}))).toEqual(['none', 'drunk', 'input_error', 'written_off']);
  });

  it('never offers an input error that would take a group to zero', () => {
    expect(missingChoices(line({ foundQuantity: null, missingQuantity: 6 }))).toEqual(['none', 'drunk', 'written_off']);
  });

  it('offers only "drunk" for an opened bottle (it has no number)', () => {
    expect(missingChoices(line({ isGroup: false, expectedQuantity: 1, missingQuantity: 1 }))).toEqual(['none', 'drunk']);
  });
});

describe('defaultFindChoice', () => {
  it('joins the one known wine of the same name, else makes a new wine; never added by default', () => {
    expect(defaultFindChoice(find(['p1']))).toEqual({ add: false, productId: 'p1' });
    // Among several, no guess: a new wine until the member picks one.
    expect(defaultFindChoice(find(['p1', 'p2']))).toEqual({ add: false, productId: null });
    expect(defaultFindChoice(find([]))).toEqual({ add: false, productId: null });
  });
});

describe('buildCorrections', () => {
  it('sends one correction per choice, leaving the counts to the server', () => {
    expect(buildCorrections({
      missing: { g1: 'drunk', g2: 'written_off', g3: 'input_error', g4: 'none' },
      surplus: new Set(['g5']),
      move: new Set(['b1']),
      finds: { f1: { add: true, productId: 'p1' }, f2: { add: true, productId: null }, f3: { add: false, productId: null } },
    })).toEqual([
      { itemId: 'g1', action: 'mark_consumed' },
      { itemId: 'g2', action: 'correct_quantity', reason: 'written_off' },
      { itemId: 'g3', action: 'correct_quantity', reason: 'input_error' },
      { itemId: 'g5', action: 'add_units' },
      { itemId: 'b1', action: 'move_to_scope' },
      { entryId: 'f1', action: 'add_to_stock', productId: 'p1' },
      { entryId: 'f2', action: 'add_to_stock' },
    ]);
  });
});

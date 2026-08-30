import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { matchDishToPairings, pickBestPairingLabel } from './pairingEngine';

describe('matchDishToPairings — properties', () => {
  it('returns an empty list for blank / punctuation-only queries', () => {
    for (const q of ['', '   ', '\n\t', '!!!', '- , .']) {
      expect(matchDishToPairings(q)).toEqual([]);
    }
  });

  it('always returns results sorted by descending score, each strictly positive', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (query) => {
        const matches = matchDishToPairings(query);
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
        }
        for (const m of matches) {
          expect(m.score).toBeGreaterThan(0);
          expect(typeof m.category).toBe('string');
        }
      }),
    );
  });

  it('is deterministic (pure) for a given query', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (query) => {
        expect(matchDishToPairings(query)).toEqual(matchDishToPairings(query));
      }),
    );
  });

  it('matches known vocabulary — a beef dish resolves to at least one combo', () => {
    expect(matchDishToPairings('entrecôte de boeuf grillée').length).toBeGreaterThan(0);
    expect(matchDishToPairings('grilled beef steak').length).toBeGreaterThan(0);
  });

  it('English and French synonyms both land on a fish pairing', () => {
    const fr = matchDishToPairings('saumon fumé');
    const en = matchDishToPairings('smoked salmon');
    expect(fr.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
  });
});

describe('pickBestPairingLabel', () => {
  it('returns null for an empty label list or a blank query', () => {
    expect(pickBestPairingLabel('boeuf', [])).toBeNull();
    expect(pickBestPairingLabel('', ['Viande rouge grillée'])).toBeNull();
  });

  it('picks a label that actually scores against the query', () => {
    const label = pickBestPairingLabel('fromage de chèvre', ['Fromage de chèvre frais', 'Dessert au chocolat']);
    expect(label).toBe('Fromage de chèvre frais');
  });

  it('returns null when nothing in the list is relevant', () => {
    expect(pickBestPairingLabel('zzzzz qqqqq', ['Viande rouge', 'Poisson grillé'])).toBeNull();
  });
});

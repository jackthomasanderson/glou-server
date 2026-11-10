import { describe, it, expect } from 'vitest';
import { pairingLabels } from './__tests__/pairingLabels';
import { matchDishToPairings, pickBestPairingLabel } from './pairingEngine';
import { RECOS } from './recommendations';

const french = pairingLabels('fr');

describe('matchDishToPairings', () => {
  it('matches a red-meat dish to red wine via the synonym dictionary (nominal case)', () => {
    const matches = matchDishToPairings('Bœuf bourguignon', french);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({ category: 'wine', subtype: 'red' });
  });

  it.each(['Viande', 'agneau'])('matches "%s" to red wine, the colour stored on bottles (#703)', (query) => {
    expect(matchDishToPairings(query, french)).toContainEqual(
      expect.objectContaining({ category: 'wine', subtype: 'red' }),
    );
  });

  it('is accent- and case-insensitive', () => {
    const withAccents = matchDishToPairings('Steak grillé', french);
    const withoutAccents = matchDishToPairings('STEAK GRILLE', french);
    expect(withAccents[0]?.category).toBe(withoutAccents[0]?.category);
    expect(withAccents[0]?.subtype).toBe(withoutAccents[0]?.subtype);
  });

  it('matches "chocolat" against several categories (wine spirits, cigars) and ranks by score', () => {
    const matches = matchDishToPairings('chocolat noir', french);
    const categories = matches.map((m) => m.category);
    expect(categories).toContain('spirit');
    expect(categories).toContain('cigar');
    // Results must be sorted by descending score.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  it('maps a category with only a "default" catalog entry to a null subtype', () => {
    const matches = matchDishToPairings('saumon fumé', french);
    const sparklingMatch = matches.find((m) => m.category === 'sparkling');
    expect(sparklingMatch?.subtype).toBeNull();
  });

  it('returns an empty array for an empty or whitespace-only query (error case)', () => {
    expect(matchDishToPairings('', french)).toEqual([]);
    expect(matchDishToPairings('   ', french)).toEqual([]);
  });

  it('returns an empty array when nothing in the catalog matches (error case)', () => {
    expect(matchDishToPairings('xyzzyplugh', french)).toEqual([]);
  });
});

// #653: the engine scores the labels the member reads, so it works on the
// English ones too — whichever language the dish is typed in.
describe('matchDishToPairings on English labels (#653)', () => {
  const english = pairingLabels('en');

  it.each(['steak', 'Bœuf bourguignon', 'grilled lamb'])('ranks red wine first for "%s"', (query) => {
    expect(matchDishToPairings(query, english)[0]).toMatchObject({ category: 'wine', subtype: 'red' });
  });

  it.each(['smoked salmon', 'saumon fumé'])('finds the sparkling wine for "%s"', (query) => {
    expect(matchDishToPairings(query, english)).toContainEqual(expect.objectContaining({ category: 'sparkling', subtype: null }));
  });

  it.each(['cheese', 'fromage', 'chocolate', 'chocolat', 'fish', 'poisson', 'poulet', 'chicken', 'oysters', 'huîtres'])(
    'finds a pairing for "%s", as the French labels do',
    (query) => {
      expect(matchDishToPairings(query, english).length).toBeGreaterThan(0);
      expect(matchDishToPairings(query, french).length).toBeGreaterThan(0);
    },
  );

  it('explains a match with the English label', () => {
    const red = RECOS.wine.red.foodPairings.map(english);
    expect(pickBestPairingLabel('steak', red)).toBe('Grilled red meat');
  });
});

// Review of #944: the words of the French labels, typed in the English
// interface, found nothing once the labels were English ("fruits de mer"),
// and the English words did not find the French labels.
describe('a dish typed in the other language finds the same bottles (#653)', () => {
  const english = pairingLabels('en');
  // The best-scoring combos: a single shared word ("fruits", "fumé") also
  // brings weaker matches that depend on how each language words its labels.
  const combos = (query: string, label: Parameters<typeof matchDishToPairings>[1]) => {
    const matches = matchDishToPairings(query, label);
    return matches.filter((m) => m.score === matches[0].score).map((m) => `${m.category}/${m.subtype}`).sort();
  };

  it.each(['fruits de mer', 'crustacés', 'salade', 'cigare', 'concombre', 'hareng fumé', 'café', 'rhum', 'fruits exotiques', 'fruits secs', 'champignons', 'volaille'])(
    'French "%s" in the English interface',
    (query) => {
      expect(combos(query, french).length).toBeGreaterThan(0);
      expect(combos(query, english)).toEqual(expect.arrayContaining(combos(query, french)));
    },
  );

  it.each(['seafood', 'salad', 'cigar', 'cucumber', 'herring', 'coffee', 'rum', 'tropical fruit', 'nuts', 'mushrooms', 'poultry'])(
    'English "%s" in the French interface',
    (query) => {
      expect(combos(query, english).length).toBeGreaterThan(0);
      expect(combos(query, french)).toEqual(expect.arrayContaining(combos(query, english)));
    },
  );
});

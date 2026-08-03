import { describe, it, expect } from 'vitest';
import { matchDishToPairings } from './pairingEngine';

describe('matchDishToPairings', () => {
  it('matches a red-meat dish to red wine via the synonym dictionary (nominal case)', () => {
    const matches = matchDishToPairings('Bœuf bourguignon');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({ category: 'wine', subtype: 'rouge' });
  });

  it('is accent- and case-insensitive', () => {
    const withAccents = matchDishToPairings('Steak grillé');
    const withoutAccents = matchDishToPairings('STEAK GRILLE');
    expect(withAccents[0]?.category).toBe(withoutAccents[0]?.category);
    expect(withAccents[0]?.subtype).toBe(withoutAccents[0]?.subtype);
  });

  it('matches "chocolat" against several categories (wine spirits, cigars) and ranks by score', () => {
    const matches = matchDishToPairings('chocolat noir');
    const categories = matches.map((m) => m.category);
    expect(categories).toContain('spirit');
    expect(categories).toContain('cigar');
    // Results must be sorted by descending score.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  it('maps a category with only a "default" catalog entry to a null subtype', () => {
    const matches = matchDishToPairings('saumon fumé');
    const sparklingMatch = matches.find((m) => m.category === 'sparkling');
    expect(sparklingMatch?.subtype).toBeNull();
  });

  it('returns an empty array for an empty or whitespace-only query (error case)', () => {
    expect(matchDishToPairings('')).toEqual([]);
    expect(matchDishToPairings('   ')).toEqual([]);
  });

  it('returns an empty array when nothing in the catalog matches (error case)', () => {
    expect(matchDishToPairings('xyzzyplugh')).toEqual([]);
  });
});

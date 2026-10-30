import { describe, it, expect } from 'vitest';
import { WINE_COLORS } from '@shared/inventory';
import { RECOS, getRecommendations } from './recommendations';

// #703 — the wine catalog was keyed in French ('rouge', 'blanc') while bottles
// store English colours, and a lookup miss fell back to the first entry: every
// white wine got the red-wine serving card.

describe('wine serving recommendations (#703)', () => {
  it.each(WINE_COLORS)('has a catalog entry for the stored colour "%s"', (color) => {
    expect(RECOS.wine[color]).toBeDefined();
  });

  it('gives a white wine white-wine advice', () => {
    const reco = getRecommendations('wine', 'white');
    expect(reco).toMatchObject({ tempMin: 10, tempMax: 12 });
    expect(reco?.foodPairings).toContain('Poisson');
    expect(reco?.foodPairings).not.toContain('Agneau');
  });

  it('gives a red wine red-wine advice', () => {
    const reco = getRecommendations('wine', 'red');
    expect(reco).toMatchObject({ tempMin: 16, tempMax: 18 });
    expect(reco?.foodPairings).toContain('Agneau');
  });

  it('gives no advice to a wine without a known colour instead of red-wine advice', () => {
    expect(getRecommendations('wine', null)).toBeNull();
    expect(getRecommendations('wine', 'rouge')).toBeNull();
  });

  it('still falls back to the category default for other categories', () => {
    expect(getRecommendations('spirit', 'tequila')).toBe(RECOS.spirit.default);
    expect(getRecommendations('sparkling', 'champagne')).toBe(RECOS.sparkling.default);
  });
});

import { describe, it, expect } from 'vitest';
import { WINE_COLORS } from '@shared/inventory';
import fs from 'fs';
import path from 'path';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';
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
    expect(reco?.foodPairings).toContain('fish');
    expect(reco?.foodPairings).not.toContain('lamb');
  });

  it('gives a red wine red-wine advice', () => {
    const reco = getRecommendations('wine', 'red');
    expect(reco).toMatchObject({ tempMin: 16, tempMax: 18 });
    expect(reco?.foodPairings).toContain('lamb');
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

// #653: the pairings were French labels written in the code, shown as-is in
// the English interface. They are now keys translated in both languages.
describe('food pairing labels (#653)', () => {
  const keys = [...new Set(Object.values(RECOS).flatMap((byType) => Object.values(byType).flatMap((r) => r.foodPairings)))];
  const pairings = (bundle: unknown) => (bundle as { tastings: { pairings: Record<string, string> } }).tastings.pairings;

  it.each(keys)('"%s" is translated in French and in English', (key) => {
    expect(pairings(fr)[key]).toEqual(expect.any(String));
    expect(pairings(en)[key]).toEqual(expect.any(String));
  });

  it('no French pairing label is left in the code', () => {
    const source = fs.readFileSync(path.join(__dirname, 'recommendations.ts'), 'utf8');
    for (const label of Object.values(pairings(fr))) expect(source).not.toContain(`'${label}'`);
    expect(source).not.toContain('Viande rouge grillée');
  });
});

import { describe, expect, it } from 'vitest';
import { isAboutItem } from '../relevance';

// #862: only a result whose title names the item is suggested as its photo.
describe('isAboutItem (#862)', () => {
  it('matches a word of the name or producer, accents and case aside', () => {
    expect(isAboutItem('CUVEE SOLSTICE - Domaine Rives 2019', 'Cuvée Solstice', 'Domaine Rives')).toBe(true);
    expect(isAboutItem('Cohiba Siglo VI cigar box', 'Siglo VI', 'Cohiba')).toBe(true);
  });

  it('does not match a title about something else', () => {
    expect(isAboutItem('SKF 6204-2Z deep groove ball bearing', 'ZZ C5 Petit', 'ZZ')).toBe(false);
  });

  it('ignores words common to countless wines and cigars', () => {
    expect(isAboutItem('Château Lafite, Grand Vin', 'Grand Vin', 'Château Martin')).toBe(false);
    expect(isAboutItem('Domaine Petit Cuvée cigar', 'Petit Cuvée', 'Domaine')).toBe(false);
  });

  it('ignores short words and parts of words', () => {
    expect(isAboutItem('Le XY de la plage', 'Le XY', 'de')).toBe(false);
    expect(isAboutItem('Margaux wines', 'Margaux', '')).toBe(true);
    expect(isAboutItem('Margauxtown', 'Margaux', '')).toBe(false);
  });
});

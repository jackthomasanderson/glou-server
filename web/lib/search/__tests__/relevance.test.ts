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

  // #1049: "Dom V" / "ZV Test" got a Dom Pérignon photo (the word "Dom" matched).
  it('rejects a title that shares only a short producer word', () => {
    expect(isAboutItem('Dom Pérignon Vintage Champagne, 2 bottles', 'ZV Test', 'Dom V')).toBe(false);
    expect(isAboutItem('ZV Test by Dom V wine bottle', 'ZV Test', 'Dom V')).toBe(true);
  });

  // The right photo of the right wine, whatever the title leaves out.
  it('keeps the photo of the wine when the title omits or abbreviates the producer', () => {
    expect(isAboutItem('Cuvée Solstice, a red', 'Cuvée Solstice', 'Domaine Rives')).toBe(true);
    expect(isAboutItem('La Tâche Grand Cru bottle', 'La Tâche', 'Domaine de la Romanée-Conti')).toBe(true);
    expect(isAboutItem('Château Lafite Rothschild 2015', 'Lafite 2015 Magnum', 'Château Lafite Rothschild')).toBe(true);
    expect(isAboutItem('Saint-Emilion Grand Cru Classé', 'St-Émilion Grand Cru', 'Château Figeac')).toBe(true);
    expect(isAboutItem('Cohiba Siglo VI box of 25', 'Siglo VI Box', 'Cohiba')).toBe(true);
  });

  it('ignores short words and parts of words', () => {
    expect(isAboutItem('Le XY de la plage', 'Le XY', 'de')).toBe(false);
    expect(isAboutItem('Margaux wines', 'Margaux', '')).toBe(true);
    expect(isAboutItem('Margauxtown', 'Margaux', '')).toBe(false);
  });
});

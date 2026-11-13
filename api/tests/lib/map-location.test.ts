import { describe, it, expect } from 'vitest';
import {
  KNOWN_REGION_NAMES, findKnownRegion, isPlacedOnMap, mapLocationOf, normalizeRegionName,
} from '../../../shared/map-location';

// #961: what the Analytics world map can place, shared by api/ and web/.

describe('findKnownRegion', () => {
  it('places the French administrative regions of 2016', () => {
    for (const name of [
      'Nouvelle-Aquitaine', 'Occitanie', 'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Grand Est',
      "Provence-Alpes-Côte d'Azur", 'Hauts-de-France', 'Normandie', 'Bretagne', 'Pays de la Loire',
      'Centre-Val de Loire', 'Île-de-France', 'Corse',
    ]) {
      expect(findKnownRegion(name), name).not.toBeNull();
    }
    // Inside metropolitan France, roughly where Nouvelle-Aquitaine is.
    expect(findKnownRegion('Nouvelle-Aquitaine')).toMatchObject({ name: 'Nouvelle-Aquitaine', lat: expect.closeTo(45.2, 0), lng: expect.closeTo(0.2, 0) });
  });

  it('matches the usual spellings, without accents, hyphens or with odd case and spaces', () => {
    expect(findKnownRegion('nouvelle aquitaine')?.name).toBe('Nouvelle-Aquitaine');
    expect(findKnownRegion('Auvergne Rhone Alpes')?.name).toBe('Auvergne-Rhône-Alpes');
    expect(findKnownRegion('Provence Alpes Cote d’Azur')?.name).toBe("Provence-Alpes-Côte d'Azur");
    expect(findKnownRegion('ile de france')?.name).toBe('Île-de-France');
    expect(findKnownRegion('  bordeaux ')?.name).toBe('Bordeaux');
    expect(findKnownRegion('Vallee du Rhone')?.name).toBe('Vallée du Rhône');
  });

  it('does not place a name it does not know', () => {
    expect(findKnownRegion('Terroir Imaginaire')).toBeNull();
    expect(findKnownRegion('')).toBeNull();
  });

  it('keeps one place per spelling: no two names of the list collide on different coordinates', () => {
    const seen = new Map<string, string>();
    for (const name of KNOWN_REGION_NAMES) {
      const key = normalizeRegionName(name);
      expect(seen.has(key), `${name} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, name);
    }
  });
});

// FEAT-114 (#989): a group of markers on the map names each region's country.
describe('findKnownRegion country', () => {
  it('knows the country of every place, as an ISO 3166-1 code', () => {
    for (const name of KNOWN_REGION_NAMES) {
      expect(findKnownRegion(name)?.country, name).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('tells apart neighbouring regions of different countries', () => {
    expect(findKnownRegion('Alsace')?.country).toBe('FR');
    expect(findKnownRegion('Mosel')?.country).toBe('DE');
    expect(findKnownRegion('Speyside')?.country).toBe('GB');
    expect(findKnownRegion('Marlborough')?.country).toBe('NZ');
    expect(findKnownRegion('Barossa')?.country).toBe('AU');
    expect(findKnownRegion('Cuba')?.country).toBe('CU');
    expect(findKnownRegion('Mendoza')?.country).toBe('AR');
  });
});

describe('mapLocationOf / isPlacedOnMap', () => {
  it('uses the region first, even when it is unknown and the appellation is known', () => {
    const wine = { category: 'wine', region: 'Terroir Imaginaire', appellation: 'Pomerol' };
    expect(mapLocationOf(wine)).toBe('Terroir Imaginaire');
    expect(isPlacedOnMap(wine)).toBe(false);
  });

  it('falls back to a known appellation when the region is empty', () => {
    expect(mapLocationOf({ category: 'wine', region: '  ', appellation: 'Pomerol' })).toBe('Pomerol');
    expect(isPlacedOnMap({ category: 'wine', region: null, appellation: 'pomerol' })).toBe(true);
  });

  it('ignores an appellation the map cannot place', () => {
    const wine = { category: 'wine', region: null, appellation: 'Cuvée Imaginaire' };
    expect(mapLocationOf(wine)).toBeNull();
    expect(isPlacedOnMap(wine)).toBe(false);
  });

  it('places a cigar by its leaf origin, else its region', () => {
    expect(mapLocationOf({ category: 'cigar', region: 'Bordeaux', leafOrigin: 'Cuba' })).toBe('Cuba');
    expect(mapLocationOf({ category: 'cigar', region: 'Cuba', leafOrigin: ' ' })).toBe('Cuba');
  });
});

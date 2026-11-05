import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { cellBadge, cellParts, gridLineParts, noUnplacedCopyText, placementText } from './gridLine';
import type { GridItem } from './types';

// Recette #471 (KO 13.2): the cellar map and its boxes of cigars.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const robusto = (over: Partial<GridItem>): GridItem => ({
  id: 'r', productId: 'p', name: 'ZZ Recette Robusto', producer: 'P', category: 'cigar', color: null, vintage: null, slots: [], unplaced: 1,
  quantity: 1, units: 25, isOpened: false, cigarsPerBox: 25, cigarsLeft: null, purchasePrice: 200, purchasedAt: '2026-11-03', ...over,
});
const bottles = { category: 'wine' as const, cigarsPerBox: null, purchasePrice: null, purchasedAt: null };
const slot = (column: number) => ({ id: `s${column}`, column, row: 1 });

describe('gridLineParts', () => {
  it('a closed box and an opened one of the same cigar read apart', () => {
    const closed = gridLineParts(robusto({}), t, 'fr').join(' · ');
    const opened = gridLineParts(robusto({ isOpened: true, cigarsLeft: 23, units: 23 }), t, 'fr').join(' · ');
    expect(closed).toMatch(/^1 boîte fermée de 25 · 200\s€ \/ boîte · 3\snov\.\s2026$/);
    expect(opened).toMatch(/^Boîte entamée · 23 restants · 200\s€ \/ boîte/);
  });

  it('bottles: their number, or "Entamée"; single cigars', () => {
    expect(gridLineParts(robusto({ ...bottles, quantity: 6 }), t, 'fr')).toEqual(['×6']);
    expect(gridLineParts(robusto({ ...bottles, isOpened: true }), t, 'fr')).toEqual(['Entamée']);
    expect(gridLineParts(robusto({ cigarsPerBox: null, quantity: 4, purchasePrice: null, purchasedAt: null }), t, 'fr')).toEqual(["4 cigares à l'unité"]);
  });
});

// FEAT-93: a cell holds one bottle or one box — its tooltip says that copy, not the whole line.
describe('cellParts', () => {
  it('a closed box: "Boîte fermée de 25", whatever the number of boxes of its line', () => {
    expect(cellParts(robusto({ quantity: 3, units: 75 }), t, 'fr').join(' · ')).toMatch(/^Boîte fermée de 25 · 200\s€ \/ boîte · 3\snov\.\s2026$/);
  });

  it('an opened box: "Boîte entamée · 23 restants"', () => {
    expect(cellParts(robusto({ isOpened: true, cigarsLeft: 23, units: 23 }), t, 'fr').slice(0, 2)).toEqual(['Boîte entamée', '23 restants']);
  });

  it('a bottle of a group x6 is one bottle: no "×6"; an opened one says "Entamée"', () => {
    expect(cellParts(robusto({ ...bottles, quantity: 6, units: 6 }), t, 'fr')).toEqual([]);
    expect(cellParts(robusto({ ...bottles, isOpened: true }), t, 'fr')).toEqual(['Entamée']);
  });

  it('a group of single cigars shares one cell: all its cigars', () => {
    expect(cellParts(robusto({ cigarsPerBox: null, quantity: 4, units: 4, purchasePrice: null, purchasedAt: null }), t, 'fr')).toEqual(["4 cigares à l'unité"]);
  });
});

// FEAT-93: the "×N" badge only where a cell holds several things — the cigars of a group of single cigars.
describe('cellBadge', () => {
  it('a group of single cigars: all its cigars', () => {
    expect(cellBadge(robusto({ cigarsPerBox: null, quantity: 4, units: 4 }))).toBe(4);
  });

  it('no badge for one single cigar, a box (closed or opened) or a bottle', () => {
    expect(cellBadge(robusto({ cigarsPerBox: null, quantity: 1, units: 1 }))).toBeNull();
    expect(cellBadge(robusto({ quantity: 3, units: 75 }))).toBeNull();
    expect(cellBadge(robusto({ isOpened: true, cigarsLeft: 23, units: 23 }))).toBeNull();
    expect(cellBadge(robusto({ ...bottles, quantity: 6, units: 6 }))).toBeNull();
  });
});

// FEAT-93 c2: "Assigner" says how many copies of a line are still to place.
describe('placementText', () => {
  it('nothing placed yet: "6 non rangées"', () => {
    expect(placementText(robusto({ ...bottles, quantity: 6, slots: [], unplaced: 6 }), t)).toBe('6 non rangées');
  });

  it('2 placed of 6: "2 rangées, 4 non rangées"; 1 and 1 in the singular', () => {
    expect(placementText(robusto({ ...bottles, quantity: 6, slots: [slot(1), slot(2)], unplaced: 4 }), t)).toBe('2 rangées, 4 non rangées');
    expect(placementText(robusto({ ...bottles, quantity: 2, slots: [slot(1)], unplaced: 1 }), t)).toBe('1 rangée, 1 non rangée');
  });

  it('a group of single cigars has one cell for the group: nothing to count', () => {
    expect(placementText(robusto({ cigarsPerBox: null, quantity: 4, units: 4, unplaced: 1 }), t)).toBe('');
  });
});

// FEAT-93 c2: a 7th bottle of a group x6 is refused with an explanation.
describe('noUnplacedCopyText', () => {
  it('bottles: "Les 6 bouteilles de cette ligne sont déjà rangées."', () => {
    expect(noUnplacedCopyText(robusto({ ...bottles, quantity: 6, slots: [1, 2, 3, 4, 5, 6].map(slot), unplaced: 0 }), t))
      .toBe('Les 6 bouteilles de cette ligne sont déjà rangées.');
    expect(noUnplacedCopyText(robusto({ ...bottles, slots: [slot(1)], unplaced: 0 }), t)).toBe('La bouteille de cette ligne est déjà rangée.');
  });

  it('boxes, and a group of single cigars', () => {
    expect(noUnplacedCopyText(robusto({ quantity: 3, units: 75, slots: [1, 2, 3].map(slot), unplaced: 0 }), t))
      .toBe('Les 3 boîtes de cette ligne sont déjà rangées.');
    expect(noUnplacedCopyText(robusto({ cigarsPerBox: null, quantity: 4, units: 4, slots: [slot(1)], unplaced: 0 }), t))
      .toBe('Ces cigares à l\'unité ont déjà leur case.');
  });
});

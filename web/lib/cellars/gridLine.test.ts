import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { gridLineParts, slotUnits } from './gridLine';
import type { GridItem } from './types';

// Recette #471 (KO 13.2): the cellar map and its boxes of cigars.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const robusto = (over: Partial<GridItem>): GridItem => ({
  id: 'r', productId: 'p', name: 'ZZ Recette Robusto', producer: 'P', category: 'cigar', color: null, vintage: null, slots: [], unplaced: 1,
  quantity: 1, units: 25, isOpened: false, cigarsPerBox: 25, cigarsLeft: null, purchasePrice: 200, purchasedAt: '2026-11-03', ...over,
});

describe('gridLineParts', () => {
  it('a closed box and an opened one of the same cigar read apart', () => {
    const closed = gridLineParts(robusto({}), t, 'fr').join(' · ');
    const opened = gridLineParts(robusto({ isOpened: true, cigarsLeft: 23, units: 23 }), t, 'fr').join(' · ');
    expect(closed).toMatch(/^1 boîte fermée de 25 · 200\s€ \/ boîte · 3 nov\. 2026$/);
    expect(opened).toMatch(/^Boîte entamée · 23 restants · 200\s€ \/ boîte/);
  });

  it('bottles: their number, or "Entamée"; single cigars', () => {
    const bottles = { category: 'wine' as const, cigarsPerBox: null, purchasePrice: null, purchasedAt: null };
    expect(gridLineParts(robusto({ ...bottles, quantity: 6 }), t, 'fr')).toEqual(['×6']);
    expect(gridLineParts(robusto({ ...bottles, isOpened: true }), t, 'fr')).toEqual(['Entamée']);
    expect(gridLineParts(robusto({ cigarsPerBox: null, quantity: 4, purchasePrice: null, purchasedAt: null }), t, 'fr')).toEqual(["4 cigares à l'unité"]);
  });
});

// FEAT-93: what one cell holds — a cell per bottle and per box, one for a group of single cigars.
describe('slotUnits', () => {
  it('a closed box counts its cigars, an opened one the cigars left', () => {
    expect(slotUnits(robusto({ quantity: 3, units: 75 }))).toBe(25);
    expect(slotUnits(robusto({ isOpened: true, cigarsLeft: 23, units: 23 }))).toBe(23);
  });

  it('a group of single cigars shares one cell: all its cigars', () => {
    expect(slotUnits(robusto({ cigarsPerBox: null, quantity: 4, units: 4 }))).toBe(4);
  });

  it('a bottle is one, whatever the size of its group', () => {
    expect(slotUnits(robusto({ category: 'wine', cigarsPerBox: null, quantity: 6, units: 6 }))).toBe(1);
  });
});

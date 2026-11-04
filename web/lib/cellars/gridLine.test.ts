import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { gridLineParts, slotUnits } from './gridLine';
import type { GridItem } from './types';

// Recette #471 (KO 13.2): the cellar map and its boxes of cigars.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const robusto = (over: Partial<GridItem>): GridItem => ({
  id: 'r', name: 'ZZ Recette Robusto', producer: 'P', category: 'cigar', slotColumn: null, slotRow: null,
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

describe('slotUnits', () => {
  it('a box of 25 counts its 25 cigars; without units, the number of copies', () => {
    expect(slotUnits(robusto({}))).toBe(25);
    expect(slotUnits(robusto({ units: undefined, quantity: 4 }))).toBe(4);
  });
});

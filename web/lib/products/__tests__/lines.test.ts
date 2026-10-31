import { beforeAll, describe, expect, it } from 'vitest';
import { familyLines, goneParts, goneSummary, lineParts, type LineContext } from '../lines';
import { openedBottle, unit } from './factories';
import { frenchT } from './i18n';

// #471 — ux-ui.md §10.3: the lines of a wine's drawer.

let ctx: LineContext;
beforeAll(async () => {
  const t = await frenchT();
  ctx = {
    kind: 'bottle',
    t,
    cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
    formatPrice: (value) => `${value} €`,
    formatMonth: (day) => day.slice(0, 7),
    formatDate: (iso) => iso.slice(0, 10),
  };
});

const cellars = (id: string) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id];

describe('familyLines — order of the lines in the cellar', () => {
  it('groups by cellar, then purchase day, then the opened ones', () => {
    const opened = openedBottle(60, { cellarId: 'garage', id: 'opened' });
    const garageJune = unit({ id: 'garage-june', cellarId: 'garage', purchasedAt: '2026-06-01' });
    const kitchen = unit({ id: 'kitchen', cellarId: 'kitchen', purchasedAt: '2026-01-10' });
    const garageJan = unit({ id: 'garage-jan', cellarId: 'garage', purchasedAt: '2026-01-10' });
    const nowhere = unit({ id: 'nowhere' });
    const lines = familyLines([opened, garageJune, nowhere, kitchen, garageJan], cellars);
    expect(lines.inCellar.map((item) => item.id)).toEqual(['kitchen', 'garage-jan', 'garage-june', 'nowhere', 'opened']);
  });

  it('keeps drunk and gone copies apart, most recent first, and leaves the trash out', () => {
    const drunk = openedBottle(0, { id: 'drunk', updatedAt: '2026-03-01T00:00:00.000Z' });
    const broken = unit({ id: 'broken', quantity: 2, writtenOffAt: '2026-04-01T00:00:00.000Z' });
    const trashed = unit({ id: 'trashed', deletedAt: '2026-05-01T00:00:00.000Z' });
    const lines = familyLines([unit({ id: 'full', quantity: 3 }), drunk, broken, trashed], cellars);
    expect(lines.inCellar.map((item) => item.id)).toEqual(['full']);
    expect(lines.gone.map((item) => item.id)).toEqual(['broken', 'drunk']);
    expect(lines).toMatchObject({ finished: 1, writtenOff: 2, showPurchaseMonth: false });
  });

  it('a wine without any copy has no line at all', () => {
    expect(familyLines([], cellars)).toMatchObject({ inCellar: [], gone: [], finished: 0, writtenOff: 0 });
  });
});

describe('lineParts — what a line says', () => {
  it('the free-text place within the cellar follows the cellar', () => {
    const item = unit({ quantity: 2, cellarId: 'garage', location: 'Étagère du haut', purchasePrice: 20 });
    expect(lineParts(item, ctx, false)).toEqual(['×2', 'Garage', 'Étagère du haut', '20 € / bouteille']);
    const opened = openedBottle(50, { location: ' Frigo ', openedAt: null });
    expect(lineParts(opened, ctx, false)).toEqual(['Entamée', 'Sans cave', 'Frigo']);
  });

  it('number, cellar, price of one bottle', () => {
    const item = unit({ quantity: 4, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-10' });
    expect(lineParts(item, ctx, false)).toEqual(['×4', 'Garage', '20 € / bouteille']);
  });

  it('the purchase month once the wine has several lines, and a non-standard size', () => {
    const item = unit({ quantity: 1, cellarId: 'garage', purchasePrice: 45, bottleSize: 'Magnum', purchasedAt: '2026-06-02' });
    expect(lineParts(item, ctx, true)).toEqual(['×1', 'Garage', '45 € / bouteille', 'Magnum', '2026-06']);
  });

  it('an opened bottle: "Entamée", its cellar and its opening day (its level is drawn beside)', () => {
    const item = openedBottle(60, { cellarId: 'kitchen', purchasePrice: 20, purchasedAt: '2026-01-10', openedAt: '2026-10-03T00:00:00.000Z' });
    expect(lineParts(item, ctx, true)).toEqual(['Entamée', 'Cuisine', 'ouverte le 2026-10-03']);
  });

  it('cigars: closed boxes, single cigars, an opened box', () => {
    const cigars = { ...ctx, kind: 'cigar' as const };
    expect(lineParts(unit({ quantity: 3, cigarsPerBox: 25, cellarId: 'garage' }), cigars, false))
      .toEqual(['3 boîtes fermées de 25', 'Garage']);
    expect(lineParts(unit({ quantity: 4, purchasePrice: 12 }), cigars, false))
      .toEqual(['4 cigares à l\'unité', 'Sans cave', '12 € / cigare']);
    expect(lineParts(unit({ isOpened: true, cigarsPerBox: 25, cigarsLeft: 10 }), cigars, false))
      .toEqual(['Boîte entamée', '10 restants', 'Sans cave']);
  });
});

describe('gone copies', () => {
  it('folded: "3 bues · 1 cassée, offerte ou perdue"', () => {
    expect(goneSummary({ finished: 3, writtenOff: 1 }, 'bottle', ctx.t)).toBe('3 bues · 1 cassée, offerte ou perdue');
    expect(goneSummary({ finished: 2, writtenOff: 0 }, 'cigar', ctx.t)).toBe('2 fumés');
  });

  it('unfolded: each with its date, its cellar of origin and its price', () => {
    const drunk = openedBottle(0, { cellarId: 'garage', purchasePrice: 20, updatedAt: '2026-10-12T08:00:00.000Z' });
    expect(goneParts(drunk, ctx)).toEqual(['Bue le 2026-10-12', 'Garage', '20 € / bouteille']);
    const broken = unit({ quantity: 2, writtenOffAt: '2026-09-01T00:00:00.000Z' });
    expect(goneParts(broken, ctx)).toEqual(['2 cassées, offertes ou perdues le 2026-09-01', 'Sans cave']);
  });
});

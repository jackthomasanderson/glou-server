import { beforeAll, describe, expect, it } from 'vitest';
import { describeStock } from '../stock';
import { openedBottle, product, unit } from './factories';
import { frenchT } from './i18n';

// #471 — ux-ui.md §10.2 (card of a wine), §10.5 ("Plus en cave"), §10.13 (edge cases).

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const line = (p: Parameters<typeof describeStock>[0], options?: Parameters<typeof describeStock>[2]) =>
  describeStock(p, t, options);

describe('describeStock — bottles', () => {
  it('counts the bottles of every group: one card, "6 bouteilles"', () => {
    const s = line(product({ items: [unit({ quantity: 4 }), unit({ quantity: 2, cellarId: 'kitchen' })] }));
    expect(s).toMatchObject({ units: 6, badge: '6', parts: ['6 bouteilles'], gone: false, hasOpened: false });
  });

  it('a single bottle shows neither "×1" nor "1 pleine": the counter says it', () => {
    const s = line(product({ items: [unit()] }));
    expect(s.badge).toBe('1');
    expect(s.parts).toEqual([]);
    expect(s.spoken).toBe('1 bouteille');
  });

  it('a lone opened bottle keeps its level on the counter', () => {
    const s = line(product({ items: [openedBottle(15)] }));
    expect(s).toMatchObject({ badge: '15 %', badgeLow: true, hasOpened: true, parts: ['1 entamée (15 %)'] });
  });

  it('full ones then the opened one with its level: "5 pleines · 1 entamée (60 %)"', () => {
    const s = line(product({ items: [unit({ quantity: 5 }), openedBottle(60)] }));
    expect(s.parts).toEqual(['5 pleines', '1 entamée (60 %)']);
    expect(s.badge).toBe('6');
    expect(s.spoken).toBe('5 bouteilles pleines, 1 entamée à 60 %');
  });

  it('several opened ones show their number, not their levels', () => {
    const s = line(product({ items: [unit({ quantity: 5 }), openedBottle(60), openedBottle(30)] }));
    expect(s.parts).toEqual(['5 pleines', '2 entamées']);
  });

  it('a different size is told in the line without another card: "dont 1 magnum"', () => {
    const items = [unit({ quantity: 4, bottleSize: '75cl' }), unit({ bottleSize: 'Magnum' })];
    expect(line(product({ items })).parts).toEqual(['5 bouteilles dont 1 magnum']);
    expect(line(product({ items: [...items, openedBottle(40)] })).parts).toEqual(['5 pleines dont 1 magnum', '1 entamée (40 %)']);
    expect(line(product({ items: [unit({ quantity: 2 }), unit({ bottleSize: '37,5cl' })] })).parts)
      .toEqual(['3 bouteilles dont 1 en 37,5cl']);
  });

  it('only what is in stock counts: written off and trashed units are left out', () => {
    const s = line(product({ items: [unit({ quantity: 3 }), unit({ writtenOffAt: '2026-03-01T00:00:00.000Z' }), unit({ deletedAt: '2026-03-01T00:00:00.000Z' })] }));
    expect(s.units).toBe(3);
  });

  it('extreme numbers stay a plain number', () => {
    expect(line(product({ items: [unit({ quantity: 500 })] })).badge).toBe('500');
  });
});

describe('describeStock — cigars', () => {
  it('"3 boîtes fermées · 1 entamée · 4 à l\'unité", counter in cigars (89)', () => {
    const s = line(product({
      category: 'cigar',
      items: [
        unit({ quantity: 3, cigarsPerBox: 25 }),
        unit({ isOpened: true, cigarsPerBox: 25, cigarsLeft: 10 }),
        unit({ quantity: 4 }),
      ],
    }));
    expect(s.parts).toEqual(['3 boîtes fermées', '1 entamée', "4 à l'unité"]);
    expect(s.badge).toBe('89');
    expect(s.kind).toBe('cigar');
  });

  it('one closed box says so', () => {
    expect(line(product({ category: 'cigar', items: [unit({ quantity: 1, cigarsPerBox: 25 })] })).parts).toEqual(['1 boîte fermée']);
  });
});

describe('describeStock — cellar filter', () => {
  const spread = product({ items: [unit({ quantity: 2, cellarId: 'kitchen' }), unit({ quantity: 7, cellarId: 'garage' })] });

  it('speaks of the cellar looked at and recalls the total: "2 ici · 9 en tout"', () => {
    const s = line(spread, { cellarIds: ['kitchen'] });
    expect(s.parts).toEqual(['2 ici', '9 en tout']);
    expect(s.spoken).toBe('2 dans cette cave, 9 en tout');
  });

  it('says nothing more when everything is in that cellar', () => {
    expect(line(spread, { cellarIds: ['kitchen', 'garage'] }).parts).toEqual(['9 bouteilles']);
  });
});

describe('describeStock — "Plus en cave"', () => {
  it('a wine with nothing left: "Plus de bouteille" and its last date, no counter', () => {
    const s = line(product({ items: [], lastActivityAt: '2026-10-12T10:00:00.000Z' }), { formatDate: () => '12 oct. 2026' });
    expect(s).toMatchObject({ gone: true, badge: null, units: 0, parts: ['Plus de bouteille', 'Dernière fois le 12 oct. 2026'] });
  });

  it('a cigar: "Plus de cigare"; without any activity, no date', () => {
    expect(line(product({ category: 'cigar', items: [] })).parts).toEqual(['Plus de cigare']);
  });
});

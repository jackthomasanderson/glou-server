import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #471 (FEAT-99, c3-c4): the export, checked on its text and by reading it
 * back through the import's own parser, header aliases and schema. The SQL
 * scope (in stock, not finished, not trashed) runs for real in
 * e2e/tests/csv-export.spec.ts.
 */
const units: Array<Record<string, unknown>> = [];
vi.mock('../../src/lib/prisma', () => ({
  prisma: { inventoryItem: { findMany: vi.fn(async () => units) } },
}));

import { prisma } from '../../src/lib/prisma';
import { inventoryExportService } from '../../src/services/inventory-export.service';
import { HEADER_ALIASES, importService } from '../../src/services/import.service';
import { normalizeToken } from '../../src/lib/category';
import { parseCsv } from '../../src/lib/csv';
import { CSV_EXPORT_COLUMNS, CSV_EXPORT_HEADERS, groupCsvRows } from '../../../shared/import';

let n = 0;
function unit(product: Record<string, unknown>, fields: Record<string, unknown> = {}) {
  return {
    id: `u${++n}`, quantity: 1, isOpened: false, fillLevel: null, cigarsLeft: null, cigarsPerBox: null, purchasePrice: null,
    purchasedAt: null, bottleSize: null, cellar: null, openedAt: null, purchasePlace: null, location: null,
    estimatedValue: null, needsReview: false,
    product: {
      category: 'wine', name: 'Cuvée', producer: 'Domaine', vintage: 2015, region: null, alcoholDegree: null, format: null,
      tags: [], grapeVarieties: [], collections: [], ...product,
    },
    ...fields,
  };
}

beforeEach(() => {
  units.length = 0;
  vi.clearAllMocks();
});

describe('export headers', () => {
  it('are all columns the import reads, in English and in French', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const column of CSV_EXPORT_COLUMNS) {
        expect(HEADER_ALIASES[normalizeToken(CSV_EXPORT_HEADERS[lang][column])], `${lang} ${column}`).toBe(column);
      }
    }
  });
});

describe('InventoryExportService.exportCsv', () => {
  it('c3: a group ×4, a group ×2 of the same wine and an opened bottle make 3 lines, each with its number or state', async () => {
    units.push(
      unit({}, { quantity: 4, purchasePrice: 20, purchasedAt: new Date('2024-01-15T00:00:00Z'), bottleSize: '75cl', cellar: { name: 'Cave 1' } }),
      unit({}, { quantity: 2, purchasePrice: 25, purchasedAt: new Date('2024-06-10T00:00:00Z'), cellar: { name: 'Cave 1' } }),
      unit({}, { isOpened: true, fillLevel: 40, purchasePrice: 20, cellar: { name: 'Cave 1' } }),
    );
    const rows = parseCsv((await inventoryExportService.exportCsv('en')).csv);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.quantity, r.opened, r['fill level'], r['purchase price'], r['purchase date']])).toEqual([
      ['4', '', '', '20', '2024-01-15'],
      ['2', '', '', '25', '2024-06-10'],
      ['1', 'yes', '40', '20', ''],
    ]);
  });

  it('reads only what is in stock and listed, through the shared scope filters', async () => {
    await inventoryExportService.exportCsv('en');
    const { where } = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({ deletedAt: null, writtenOffAt: null });
    expect(where.product).toBeDefined();
  });

  it('c4: reimported, an export gives back the same lines, cellars, prices and opened units', async () => {
    units.push(
      unit({ name: 'Cuvée, "Spéciale"', region: 'Bordeaux' }, { quantity: 6, purchasePrice: 12.5, purchasedAt: new Date('2023-05-01T00:00:00Z'), cellar: { name: 'Cave, du haut' } }),
      unit({ name: 'Cuvée, "Spéciale"', region: 'Bordeaux' }, { isOpened: true, fillLevel: 30, purchasePrice: 12.5, cellar: { name: 'Cave, du haut' } }),
      unit({ category: 'spirit', name: '=Lagavulin', vintage: null, alcoholDegree: 43 }, { quantity: 2, bottleSize: '70cl' }),
      unit({ category: 'cigar', name: 'Robusto', vintage: null, format: 'Robusto' }, { quantity: 3, cigarsPerBox: 20, purchasePrice: 150 }),
      unit({ category: 'cigar', name: 'Robusto', vintage: null, format: 'Robusto' }, { isOpened: true, cigarsPerBox: 20, cigarsLeft: 7, purchasePrice: 150 }),
      unit({ category: 'cigar', name: 'Panatela', vintage: null, format: 'Panatela' }, { quantity: 5 }),
    );
    for (const lang of ['en', 'fr'] as const) {
      const { csv: text } = await inventoryExportService.exportCsv(lang);
      const { valid, errors } = importService.previewCsv(Buffer.from(text, 'utf-8'));
      expect(errors, lang).toEqual([]);
      const lines = groupCsvRows(valid).map((l) => ({
        name: l.row.name, count: l.count, perBox: l.cigarsPerBox, units: l.units, opened: l.row.opened ?? false,
        cellar: l.row.cellar, price: l.row.purchasePrice, level: l.row.fillLevel, left: l.row.cigarsLeft,
      }));
      expect(lines, lang).toEqual([
        { name: 'Panatela', count: 5, perBox: null, units: 5, opened: false, cellar: undefined, price: undefined, level: undefined, left: undefined },
        { name: 'Robusto', count: 3, perBox: 20, units: 60, opened: false, cellar: undefined, price: 150, level: undefined, left: undefined },
        { name: 'Robusto', count: 1, perBox: 20, units: 7, opened: true, cellar: undefined, price: 150, level: undefined, left: 7 },
        { name: '=Lagavulin', count: 2, perBox: null, units: 2, opened: false, cellar: undefined, price: undefined, level: undefined, left: undefined },
        { name: 'Cuvée, "Spéciale"', count: 6, perBox: null, units: 6, opened: false, cellar: 'Cave, du haut', price: 12.5, level: undefined, left: undefined },
        { name: 'Cuvée, "Spéciale"', count: 1, perBox: null, units: 1, opened: true, cellar: 'Cave, du haut', price: 12.5, level: 30, left: undefined },
      ]);
    }
  });

  it('neutralises a formula in a name in the file itself', async () => {
    units.push(unit({ name: '=1+1' }));
    expect((await inventoryExportService.exportCsv('en')).csv).toContain("'=1+1");
  });

  it('writes a header-only file for an empty cellar', async () => {
    const { csv: text, rows } = await inventoryExportService.exportCsv('fr');
    expect(rows).toBe(0);
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(1);
    expect(text).toContain("Prix d'achat");
  });

  /** Reads an export back as the import does: rows, then lines. */
  async function reimport(lang: 'en' | 'fr') {
    const { csv } = await inventoryExportService.exportCsv(lang);
    const { valid, errors } = importService.previewCsv(Buffer.from(csv, 'utf-8'));
    expect(errors, lang).toEqual([]);
    return { csv, valid, lines: groupCsvRows(valid) };
  }

  it('keeps two groups of one day and price apart when only their place of purchase differs (decision 22)', async () => {
    const same = { purchasePrice: 20, purchasedAt: new Date('2024-01-15T00:00:00Z'), cellar: { name: 'Cave 1' } };
    units.push(
      unit({}, { ...same, quantity: 4, purchasePlace: 'Nicolas' }),
      unit({}, { ...same, quantity: 2, purchasePlace: 'Salon des vins' }),
      unit({}, { ...same, quantity: 3, purchasePlace: 'Nicolas', location: 'Cave du bas', estimatedValue: 45.5 }),
    );
    for (const lang of ['en', 'fr'] as const) {
      const { lines } = await reimport(lang);
      expect(lines.map((l) => [l.count, l.row.purchasePlace, l.row.location, l.row.estimatedValue]).sort()).toEqual([
        [2, 'Salon des vins', undefined, undefined], [3, 'Nicolas', 'Cave du bas', 45.5], [4, 'Nicolas', undefined, undefined],
      ]);
    }
  });

  it('gives back the opening day, a group still to review, and the cigars really left', async () => {
    units.push(
      unit({}, { quantity: 3, needsReview: true }),
      unit({}, { isOpened: true, fillLevel: 80, openedAt: new Date('2025-02-03T00:00:00Z') }),
      unit({ category: 'cigar', name: 'Box', vintage: null, format: 'Robusto' }, { isOpened: true, cigarsPerBox: 20, cigarsLeft: null }),
      unit({ category: 'cigar', name: 'Box', vintage: null, format: 'Robusto' }, { isOpened: true, cigarsPerBox: 20, cigarsLeft: 12 }),
    );
    const { lines } = await reimport('en');
    const byKind = (opened: boolean) => lines.filter((l) => (l.row.opened ?? false) === opened);
    expect(byKind(false).map((l) => [l.count, l.row.needsReview])).toEqual([[3, true]]);
    expect(lines.find((l) => l.row.fillLevel === 80)?.row.openedAt).toBe('2025-02-03');
    expect(lines.filter((l) => l.kind === 'cigar').map((l) => l.row.cigarsLeft).sort()).toEqual([1, 12]);
  });

  it('writes an opened unit as opened and one unit, and a closed one with its real quantity', async () => {
    units.push(
      unit({}, { quantity: 6, isOpened: false, fillLevel: 60 }),
      unit({}, { quantity: 1, isOpened: true, fillLevel: 60 }),
    );
    const rows = parseCsv((await inventoryExportService.exportCsv('en')).csv);
    expect(rows.map((r) => [r.quantity, r.opened])).toEqual([['6', ''], ['1', 'yes']]);
  });

  it('gives back the description of the family: colour, appellation, grapes, tags, notes, window, spirit and cigar fields', async () => {
    units.push(
      unit({
        name: 'Talbot', color: 'red', appellation: 'Saint-Julien', classification: '4e cru', grapeVarieties: ['Cabernet', 'Merlot'],
        tags: ['fête', 'a|b'], notes: 'Ligne un\nligne "deux", fin', collections: [{ name: 'Noël' }, { name: 'Médoc' }], serviceTemp: '16°C', lotNumber: 'L1',
        peakMaturityFrom: 2025, peakMaturityTo: 2040, needsAeration: true, batchDate: new Date('2021-05-01T00:00:00Z'),
      }, { quantity: 1 }),
      unit({ category: 'sparkling', name: 'Brut', sparklingType: 'champagne', sugarLevel: 'brut', baseYear: 2018, disgorgingDate: new Date('2023-01-02T00:00:00Z') }),
      unit({
        category: 'spirit', name: 'Lagavulin', vintage: null, alcoholDegree: 43.5, spiritType: 'whisky', edition: '16 ans', declaredAge: 16,
        caskType: 'sherry', additions: 'aucun', aromaticProfile: 'tourbé', isSingleCask: true, caskNumber: 'C9', caskProof: 57.3,
      }),
      unit({
        category: 'cigar', name: 'Robusto', vintage: null, format: 'Robusto', manufactureYear: 2020, leafOrigin: 'Cuba', factoryCode: 'HAV',
        recommendedHumidity: 70.5, humidificationSystem: 'Boveda',
      }, { cigarsPerBox: 20 }),
    );
    for (const lang of ['en', 'fr'] as const) {
      const { lines } = await reimport(lang);
      const row = (name: string) => lines.find((l) => l.row.name === name)!.row;
      expect(row('Talbot')).toMatchObject({
        color: 'red', appellation: 'Saint-Julien', classification: '4e cru', grapeVarieties: ['Cabernet', 'Merlot'],
        collection: ['Médoc', 'Noël'], serviceTemp: '16°C', lotNumber: 'L1', peakMaturityFrom: 2025, peakMaturityTo: 2040,
        needsAeration: true, batchDate: '2021-05-01', notes: 'Ligne un\nligne "deux", fin',
      });
      // A "|" inside a tag splits it on the way back: lists cannot hold their own separator.
      expect(row('Talbot').tags).toEqual(['fête', 'a', 'b']);
      expect(row('Brut')).toMatchObject({ sparklingType: 'champagne', sugarLevel: 'brut', baseYear: 2018, disgorgingDate: '2023-01-02' });
      expect(row('Lagavulin')).toMatchObject({
        alcoholDegree: 43.5, spiritType: 'whisky', edition: '16 ans', declaredAge: 16, caskType: 'sherry', additions: 'aucun',
        aromaticProfile: 'tourbé', isSingleCask: true, caskNumber: 'C9', caskProof: 57.3,
      });
      expect(row('Robusto')).toMatchObject({
        manufactureYear: 2020, leafOrigin: 'Cuba', factoryCode: 'HAV', recommendedHumidity: 70.5, humidificationSystem: 'Boveda',
      });
    }
  });

  it('writes the French file with ";" and decimal commas, the English one with "," and points', async () => {
    units.push(unit({}, { purchasePrice: 12.5 }));
    const fr = (await inventoryExportService.exportCsv('fr')).csv.split('\r\n');
    const en = (await inventoryExportService.exportCsv('en')).csv.split('\r\n');
    expect(fr[0]).toContain("Nom;Producteur;Catégorie");
    expect(fr[1]).toContain(';12,5;');
    expect(en[0]).toContain('Name,Producer,Category');
    expect(en[1]).toContain(',12.5,');
  });

  it('counts the lines written, to warn when one import could not take them all', async () => {
    units.push(unit({}), unit({ name: 'B' }));
    expect((await inventoryExportService.exportCsv('en')).rows).toBe(2);
  });
});

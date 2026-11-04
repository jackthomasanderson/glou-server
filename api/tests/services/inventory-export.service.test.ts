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
import { normalizeCsvToken } from '../../src/schemas/import.schema';
import { parseCsv } from '../../src/lib/csv';
import { CSV_EXPORT_COLUMNS, CSV_EXPORT_HEADERS, groupCsvRows } from '../../../shared/import';

let n = 0;
function unit(product: Record<string, unknown>, fields: Record<string, unknown> = {}) {
  return {
    id: `u${++n}`, quantity: 1, isOpened: false, fillLevel: null, cigarsLeft: null, cigarsPerBox: null, purchasePrice: null,
    purchasedAt: null, bottleSize: null, cellar: null,
    product: { category: 'wine', name: 'Cuvée', producer: 'Domaine', vintage: 2015, region: null, alcoholDegree: null, format: null, ...product },
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
        expect(HEADER_ALIASES[normalizeCsvToken(CSV_EXPORT_HEADERS[lang][column])], `${lang} ${column}`).toBe(column);
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
    const rows = parseCsv(await inventoryExportService.exportCsv('en'));
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
    expect(where).toMatchObject({ deletedAt: null, writtenOffAt: null, isOwned: true });
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
      const text = await inventoryExportService.exportCsv(lang);
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
    expect(await inventoryExportService.exportCsv('en')).toContain("'=1+1");
  });

  it('writes a header-only file for an empty cellar', async () => {
    const text = await inventoryExportService.exportCsv('fr');
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(1);
    expect(text).toContain("Prix d'achat");
  });
});

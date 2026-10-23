import { describe, it, expect, vi, beforeEach } from 'vitest';

// `previewCsv` never touches the database, but the module graph reaches
// `lib/prisma` through `inventory.service` — mock it so no client is built.
const tx = {
  $executeRaw: vi.fn(),
  inventoryItem: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
};
const transaction = vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => (transaction as (...a: unknown[]) => unknown)(...args),
    inventoryItem: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { importService } from '../../src/services/import.service';
import { IN_STOCK_ITEM_FILTER } from '../../src/lib/finished-item';
import type { CsvImportRow } from '../../src/schemas/import.schema';

const csv = (text: string) => Buffer.from(text, 'utf-8');

describe('ImportService.previewCsv', () => {
  it('accepts a comma-separated file', () => {
    const result = importService.previewCsv(
      csv('name,producer,category,vintage\nPétrus,Château Pétrus,wine,2015\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015 },
    ]);
  });

  it('accepts a French Excel export: UTF-8 BOM + semicolon delimiter (ISSUE_039)', () => {
    const result = importService.previewCsv(
      csv('\uFEFFname;producer;category;vintage\r\nPétrus;Château Pétrus;wine;2015\r\nLagavulin;Diageo;spirit;\r\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015 },
      { name: 'Lagavulin', producer: 'Diageo', category: 'spirit' },
    ]);
  });

  it('reports one global error instead of one per row when no column is recognized', () => {
    const result = importService.previewCsv(
      csv('libellé|domaine|type\nPétrus|Château Pétrus|wine\nLagavulin|Diageo|spirit\n'),
    );
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([{ row: 1, reason: 'UNRECOGNIZED_COLUMNS' }]);
  });

  it('still reports per-row errors once the header is understood', () => {
    const result = importService.previewCsv(
      csv('name;producer;category\n;Château Pétrus;wine\nLagavulin;Diageo;beer\n'),
    );
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, reason: 'NAME_REQUIRED' },
      { row: 3, reason: 'INVALID_CATEGORY' },
    ]);
  });

  // #510: a French spreadsheet used to be rejected wholesale.
  it('accepts French headers, French category names and the optional columns', () => {
    const result = importService.previewCsv(
      csv('Nom;Producteur;Catégorie;Millésime;Prix;Région;Quantité;Degré\n'
        + 'Pétrus;Château Pétrus;Vin;2015;12,50 €;Pomerol;;\n'
        + 'Krug;Krug;Bulles;;;;;\n'
        + 'Lagavulin 16;Diageo;Spiritueux;;89;Islay;;43\n'
        + 'Robusto;Cohiba;Cigares;;;;25;\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015, purchasePrice: 12.5, region: 'Pomerol' },
      { name: 'Krug', producer: 'Krug', category: 'sparkling' },
      { name: 'Lagavulin 16', producer: 'Diageo', category: 'spirit', purchasePrice: 89, region: 'Islay', alcoholDegree: 43 },
      { name: 'Robusto', producer: 'Cohiba', category: 'cigar', quantity: 25 },
    ]);
  });

  it('rejects an out-of-range ABV with its own code', () => {
    const result = importService.previewCsv(csv('name,producer,category,abv\nX,Y,spirit,140\n'));
    expect(result.errors).toEqual([{ row: 2, reason: 'INVALID_ABV' }]);
  });

  // FEAT-91 (#641): rows past 500 used to be dropped without a word; the
  // preview now returns them all, and the screen says the file is too large.
  it('reads every row of the file, past 500', () => {
    const rows = Array.from({ length: 720 }, (_, i) => `Wine ${i},Domaine,wine`).join('\n');
    expect(importService.previewCsv(csv(`name,producer,category\n${rows}\n`)).valid).toHaveLength(720);
  });

  it('returns an empty preview for an empty file', () => {
    expect(importService.previewCsv(csv(''))).toEqual({ valid: [], errors: [] });
  });
});

describe('ImportService.confirmImport', () => {
  beforeEach(() => {
    tx.inventoryItem.create.mockReset().mockResolvedValue({});
    tx.inventoryItem.findMany.mockReset().mockResolvedValue([]);
  });

  const row = (overrides: Partial<CsvImportRow> = {}): CsvImportRow => ({
    name: 'Pétrus',
    producer: 'Château Pétrus',
    category: 'wine',
    vintage: 2015,
    ...overrides,
  });

  it('creates every row when none of them already exist (ISSUE_141)', async () => {
    const result = await importService.confirmImport('u1', [row()], null);
    expect(result).toEqual({ created: 1, skippedDuplicates: 0 });
    expect(tx.inventoryItem.create).toHaveBeenCalledTimes(1);
  });

  // ISSUE_141/ISSUE_068: CSV import was the one creation path with zero
  // duplicate detection at all — the highest-volume way to double a shelf.
  it('skips a row that already matches an existing item instead of erroring', async () => {
    tx.inventoryItem.findMany.mockResolvedValue([
      { category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2015, bottleSize: null },
    ]);
    const result = await importService.confirmImport('u1', [row()], null);
    expect(result).toEqual({ created: 0, skippedDuplicates: 1 });
    expect(tx.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('imports a spirit without an ABV column with no made-up 0 % (#510)', async () => {
    await importService.confirmImport('u1', [row({ category: 'spirit', vintage: undefined, name: 'Lagavulin' })], null);
    const data = tx.inventoryItem.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.alcoholDegree ?? null).toBeNull();
  });

  it('still creates a row whose vintage actually differs from the existing one', async () => {
    tx.inventoryItem.findMany.mockResolvedValue([
      { category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2010, bottleSize: null },
    ]);
    const result = await importService.confirmImport('u1', [row({ vintage: 2015 })], null);
    expect(result).toEqual({ created: 1, skippedDuplicates: 0 });
  });

  // FEAT-91 (#577): one item per bottle (design.md glossary), so a case of 6
  // written either way gives 6 bottles, not 1 and "5 already in your inventory".
  it('creates one bottle per unit of a wine row\'s quantity', async () => {
    const result = await importService.confirmImport('u1', [row({ quantity: 6 })], null);
    expect(result).toEqual({ created: 6, skippedDuplicates: 0 });
    expect(tx.inventoryItem.create).toHaveBeenCalledTimes(6);
  });

  it('creates every one of six identical rows instead of matching them against each other', async () => {
    // A row created earlier in this import must not count as "already there".
    tx.inventoryItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      tx.inventoryItem.findMany.mockResolvedValue([data]);
      return data;
    });
    const result = await importService.confirmImport('u1', Array.from({ length: 6 }, () => row()), null);
    expect(result).toEqual({ created: 6, skippedDuplicates: 0 });
  });

  const createdData = (call = 0) => tx.inventoryItem.create.mock.calls[call]?.[0]?.data as Record<string, unknown>;

  // FEAT-91: a cigar item is a box; its quantity is the number of cigars in it.
  it('imports a cigar row as one box holding its quantity, tagged as coming from the file', async () => {
    const result = await importService.confirmImport(
      'u1', [row({ category: 'cigar', vintage: undefined, name: 'Robusto', producer: 'Cohiba', quantity: 25 })], null,
    );
    expect(result).toEqual({ created: 1, skippedDuplicates: 0 });
    expect(createdData()).toMatchObject({ quantity: 25, fieldSources: { quantity: 'import_csv' } });
  });

  // FEAT-05 honesty: a field is tagged "from the CSV file" only if its value is saved.
  it('never tags a value it does not save as coming from the file', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 6, alcoholDegree: 13.5 }),
      row({ category: 'spirit', name: 'Lagavulin', vintage: 2010 }),
    ], null);
    const wineSources = createdData(0).fieldSources as Record<string, unknown>;
    expect(wineSources).not.toHaveProperty('quantity');
    expect(wineSources).not.toHaveProperty('alcoholDegree');
    expect(wineSources).toMatchObject({ vintage: 'import_csv' });
    expect(createdData(6).fieldSources).not.toHaveProperty('vintage');
  });

  // FEAT-91 (#577): a finished bottle, a non-owned reference or one in the
  // trash is not "already in the cellar" — a new purchase of it is imported.
  // The SQL itself is exercised on a real database by e2e/tests/csv-import.spec.ts.
  it('matches rows only against what is in stock', async () => {
    await importService.confirmImport('u1', [row()], null);
    const { where } = tx.inventoryItem.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(where).toEqual({ ...IN_STOCK_ITEM_FILTER, category: { in: ['wine'] } });
  });

  // FEAT-91: a retry sent while the first import is still being written must
  // wait for it, then see its bottles in stock — not import them a second time.
  it('waits for any import in progress before reading the stock', async () => {
    const order: string[] = [];
    tx.$executeRaw.mockImplementation(async () => { order.push('lock'); return 1; });
    tx.inventoryItem.findMany.mockImplementation(async () => { order.push('read stock'); return []; });

    await importService.confirmImport('u1', [row()], null);

    expect(order).toEqual(['lock', 'read stock']);
    expect(String(tx.$executeRaw.mock.calls[0]?.[0])).toContain('pg_advisory_xact_lock');
  });

  // #633: the duplicate check used to re-read the whole category for every row.
  it('reads the inventory once for the whole file, not once per row', async () => {
    await importService.confirmImport('u1', [row(), row({ name: 'Le Pin' }), row({ category: 'spirit', name: 'Lagavulin' })], null);
    expect(tx.inventoryItem.findMany).toHaveBeenCalledTimes(1);
  });
});

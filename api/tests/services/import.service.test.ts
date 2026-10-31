import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #471 (FEAT-99): an in-memory stand-in for the few tables the import reads
 * and writes, so that the aggregation, the family matching, the lock order
 * and a second "Confirm" are checked on their outcome, not on call counts.
 * The SQL filters themselves run on a real database in e2e/tests/csv-import.spec.ts.
 */
interface FakeProduct { id: string; category: string; name: string; producer: string; vintage: number | null; format: string | null; deletedAt: Date | null; createdAt: Date; [field: string]: unknown }
interface FakeUnit { id: string; productId: string; quantity: number; isOpened: boolean; fillLevel: number | null; cigarsPerBox: number | null; cigarsLeft: number | null; writtenOffAt: Date | null; deletedAt: Date | null; isOwned: boolean; cellarId: string | null; purchasePrice: number | null; purchasedAt: Date | null; bottleSize: string | null; createdAt: Date; [field: string]: unknown }

const db = {
  products: [] as FakeProduct[],
  units: [] as FakeUnit[],
  cellars: [] as Array<{ id: string; name: string; type?: string; createdAt: Date }>,
  log: [] as string[],
};
let sequence = 0;
const next = (prefix: string) => `${prefix}${++sequence}`;

const tx = {
  $executeRaw: vi.fn(async (strings: TemplateStringsArray) => { db.log.push(strings.join('?').includes('advisory') ? 'advisory lock' : 'execute'); return 1; }),
  $queryRaw: vi.fn(async (_strings: TemplateStringsArray, id: string) => { db.log.push(`lock ${id}`); return []; }),
  product: {
    findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; category?: { in: string[] } } }) =>
      db.products.filter((p) => p.deletedAt === null
        && (!where.id || where.id.in.includes(p.id))
        && (!where.category || where.category.in.includes(p.category)))),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const product = { id: next('p'), vintage: null, format: null, deletedAt: null, createdAt: new Date(), ...data } as FakeProduct;
      db.products.push(product);
      db.log.push(`create family ${product.name}`);
      return product;
    }),
  },
  inventoryItem: {
    findMany: vi.fn(async ({ where }: { where: { productId: string | { in: string[] } } }) =>
      db.units.filter((u) => u.deletedAt === null && u.writtenOffAt === null
        && (typeof where.productId === 'string' ? u.productId === where.productId : where.productId.in.includes(u.productId)))),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const unit = {
        isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null, deletedAt: null, isOwned: true,
        createdAt: new Date(), ...data,
      } as FakeUnit;
      db.units.push(unit);
      db.log.push(`create unit ×${unit.quantity}`);
      return unit;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const unit = db.units.find((u) => u.id === where.id)!;
      Object.assign(unit, data);
      db.log.push(`update unit ×${unit.quantity}`);
      return unit;
    }),
  },
  cellar: {
    findMany: vi.fn(async () => db.cellars),
    create: vi.fn(async ({ data }: { data: { name: string; type?: string } }) => {
      const cellar = { id: next('c'), createdAt: new Date(), ...data };
      db.cellars.push(cellar);
      return cellar;
    }),
  },
};
const transaction = vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => (transaction as (...a: unknown[]) => unknown)(...args),
    get product() { return tx.product; },
    get inventoryItem() { return tx.inventoryItem; },
    get cellar() { return tx.cellar; },
  },
}));

import { importService } from '../../src/services/import.service';
import type { CsvImportRow } from '../../../shared/import';

const csv = (text: string) => Buffer.from(text, 'utf-8');

beforeEach(() => {
  db.products = [];
  db.units = [];
  db.cellars = [];
  db.log = [];
  sequence = 0;
  vi.clearAllMocks();
});

/** A family already in the instance, with `units` copies in stock (one group). */
function existingWine(name: string, units: number, fields: Partial<FakeProduct> = {}) {
  const product: FakeProduct = {
    id: `existing-${name}`, category: 'wine', name, producer: 'Château Pétrus', vintage: 2015, format: null,
    deletedAt: null, createdAt: new Date('2025-01-01'), ...fields,
  };
  db.products.push(product);
  if (units > 0) {
    db.units.push({
      id: `unit-${name}`, productId: product.id, quantity: units, isOpened: false, fillLevel: null, cigarsPerBox: null,
      cigarsLeft: null, writtenOffAt: null, deletedAt: null, isOwned: true, cellarId: 'cellar-1', purchasePrice: 20,
      purchasedAt: new Date('2025-01-01T00:00:00Z'), bottleSize: null, createdAt: new Date('2025-01-01'),
    });
  }
  return product;
}

const row = (overrides: Partial<CsvImportRow> = {}): CsvImportRow => ({
  name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015, ...overrides,
});

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

  it('returns an empty preview for an empty file', async () => {
    expect(importService.previewCsv(csv(''))).toEqual({ valid: [], errors: [] });
    expect(await importService.preview(csv(''))).toEqual({ valid: [], errors: [], lines: [], newCellars: [] });
  });
});


// #471 (FEAT-99): the columns that tell a group apart.
describe('ImportService.previewCsv — group columns', () => {
  it('reads the cellar, purchase day, bottle size, vitola and box size', () => {
    const result = importService.previewCsv(csv(
      'Nom;Producteur;Catégorie;Cave;Date d\'achat;Contenance;Vitole;Format de boîte;Quantité\n'
      + 'Pétrus;Château Pétrus;Vin;Garage;15/03/2024;Magnum;;;2\n'
      + 'Robusto;Cohiba;Cigare;Humidor;2024-3-5;;Robusto;25;3\n'
      + 'Siglo;Cohiba;Cigare;;;;;à l\'unité;4\n',
    ));
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', cellar: 'Garage', purchasedAt: '2024-03-15', bottleSize: 'Magnum', quantity: 2 },
      { name: 'Robusto', producer: 'Cohiba', category: 'cigar', cellar: 'Humidor', purchasedAt: '2024-03-05', format: 'Robusto', cigarsPerBox: 25, quantity: 3 },
      { name: 'Siglo', producer: 'Cohiba', category: 'cigar', cigarsPerBox: 'single', quantity: 4 },
    ]);
  });

  it('refuses a day that does not exist and a box size that is not a number', () => {
    const result = importService.previewCsv(csv('name,producer,category,purchase date,box size\nA,B,wine,31/02/2024,\nC,D,cigar,,many\n'));
    expect(result.errors).toEqual([{ row: 2, reason: 'INVALID_PURCHASE_DATE' }, { row: 3, reason: 'INVALID_BOX_SIZE' }]);
  });
});

describe('ImportService.preview', () => {
  it('adds up identical rows into one line and marks a wine already in the cellar', async () => {
    existingWine('Pétrus', 4);
    const preview = await importService.preview(csv(
      'name,producer,category,vintage,quantity\n'
      + 'Pétrus,Château Pétrus,wine,2015,3\n'
      + 'Le Pin,Le Pin,wine,2016,3\n'
      + 'Le Pin,Le Pin,wine,2016,3\n',
    ));
    expect(preview.valid).toHaveLength(3);
    expect(preview.lines.map(({ row: { name }, count, rowCount, units, inStock }) => ({ name, count, rowCount, units, inStock }))).toEqual([
      { name: 'Pétrus', count: 3, rowCount: 1, units: 3, inStock: 4 },
      { name: 'Le Pin', count: 6, rowCount: 2, units: 6, inStock: 0 },
    ]);
  });

  it('announces the cellars the import will create, once each (QP3)', async () => {
    db.cellars.push({ id: 'cellar-1', name: 'Garage', createdAt: new Date() });
    const preview = await importService.preview(csv(
      'name,producer,category,cellar\nA,B,wine,garage\nC,D,wine,Cuisine\nE,F,wine,cuisine \n',
    ));
    expect(preview.newCellars).toEqual(['Cuisine']);
    expect(preview.lines.map((line) => line.newCellar)).toEqual([false, true, true]);
  });

  it('never writes', async () => {
    await importService.preview(csv('name,producer,category\nA,B,wine\n'));
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.inventoryItem.create).not.toHaveBeenCalled();
    expect(tx.cellar.create).not.toHaveBeenCalled();
  });
});

describe('ImportService.confirmImport', () => {
  const units = () => db.units.map(({ productId, quantity, cigarsPerBox, cellarId, purchasePrice, bottleSize }) =>
    ({ productId, quantity, cigarsPerBox, cellarId, purchasePrice, bottleSize }));

  // FEAT-99 c1.
  it('imports a wine row of quantity 6 as one family with a group ×6: 6 bottles, 1 wine', async () => {
    const result = await importService.confirmImport('u1', [row({ quantity: 6 })], 'cellar-1');
    expect(result).toEqual({ bottles: 6, wines: 1, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, createdCellars: [] });
    expect(db.products).toHaveLength(1);
    expect(units()).toEqual([{ productId: 'p1', quantity: 6, cigarsPerBox: null, cellarId: 'cellar-1', purchasePrice: null, bottleSize: null }]);
  });

  // FEAT-99 c2, decision 38.
  it('adds up two identical rows of 3 into one group ×6', async () => {
    const result = await importService.confirmImport('u1', [row({ quantity: 3 }), row({ quantity: 3 })], null);
    expect(result.bottles).toBe(6);
    expect(units()).toEqual([expect.objectContaining({ quantity: 6 })]);
  });

  // Decision 58: the purchase day is part of a group's identity.
  it('keeps rows of the same wine bought on different days as separate groups of one family', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 6, purchasedAt: '2024-01-10' }),
      row({ quantity: 2, purchasedAt: '2024-06-10' }),
      row({ quantity: 1, purchasedAt: '2024-06-10', bottleSize: 'Magnum' }),
    ], null);
    expect(db.products).toHaveLength(1);
    expect(db.units.map((u) => [u.quantity, u.purchasedAt?.toISOString().slice(0, 10), u.bottleSize])).toEqual([
      [6, '2024-01-10', null], [2, '2024-06-10', null], [1, '2024-06-10', 'Magnum'],
    ]);
  });

  it('joins the family of the same productKey, whatever the case and spaces', async () => {
    const known = existingWine('Pétrus', 0);
    const result = await importService.confirmImport('u1', [row({ name: '  PÉTRUS ', producer: 'château pétrus', quantity: 2 })], null);
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(units()).toEqual([expect.objectContaining({ productId: known.id, quantity: 2 })]);
    expect(result.wines).toBe(1);
  });

  it('never joins a family of another vintage, or one in the trash', async () => {
    existingWine('Pétrus', 0, { vintage: 2010 });
    existingWine('Pétrus-trash', 0, { name: 'Pétrus', deletedAt: new Date() });
    await importService.confirmImport('u1', [row()], null);
    expect(tx.product.create).toHaveBeenCalledTimes(1);
  });

  // Point 37: "Ignorer (déjà comptées)" by default.
  it('leaves out a line whose wine is already in the cellar unless the member chose to add it', async () => {
    existingWine('Pétrus', 4);
    const ignored = await importService.confirmImport('u1', [row({ quantity: 3 })], 'cellar-1');
    expect(ignored).toMatchObject({ bottles: 0, wines: 0, skippedLines: 1, skippedUnits: 3 });
    expect(units()).toEqual([expect.objectContaining({ quantity: 4 })]);

    const [line] = (await importService.preview(csv('name,producer,category,vintage,quantity\nPétrus,Château Pétrus,wine,2015,3\n'))).lines;
    const added = await importService.confirmImport('u1', [row({ quantity: 3 })], 'cellar-1', [{ key: line.key, inStock: 4, add: true }]);
    expect(added).toMatchObject({ bottles: 3, wines: 1, skippedLines: 0 });
    expect(db.units.map((u) => u.quantity)).toEqual([4, 3]);
  });

  it('completes the group of the same identity instead of adding a line', async () => {
    existingWine('Pétrus', 4);
    const [line] = (await importService.preview(csv('name,producer,category,vintage,price,purchase date,cellar\nPétrus,Château Pétrus,wine,2015,20,2025-01-01,Cave\n'))).lines;
    db.cellars.push({ id: 'cellar-1', name: 'Cave', createdAt: new Date() });
    await importService.confirmImport('u1', [row({ purchasePrice: 20, purchasedAt: '2025-01-01', cellar: 'Cave' })], null, [{ key: line.key, inStock: 4, add: true }]);
    expect(units()).toEqual([expect.objectContaining({ quantity: 5, cellarId: 'cellar-1' })]);
  });

  // Idempotence of a double click on "Confirmer".
  it('adds nothing the second time the same import is confirmed', async () => {
    existingWine('Pétrus', 4);
    const rows = [row({ quantity: 3 }), row({ name: 'Le Pin', producer: 'Le Pin', quantity: 6 })];
    const [petrus] = (await importService.preview(csv('name,producer,category,vintage,quantity\nPétrus,Château Pétrus,wine,2015,3\n'))).lines;
    const choices = [{ key: petrus.key, inStock: 4, add: true }];

    const first = await importService.confirmImport('u1', rows, null, choices);
    const second = await importService.confirmImport('u1', rows, null, choices);

    expect(first).toMatchObject({ bottles: 9, wines: 2 });
    expect(second).toMatchObject({ bottles: 0, wines: 0, skippedLines: 2, skippedUnits: 9 });
    expect(db.units.reduce((n, u) => n + u.quantity, 0)).toBe(13);
  });

  // QP3.
  it('creates an unknown cellar once, a humidor when only cigars go in it, and says so', async () => {
    db.cellars.push({ id: 'cellar-1', name: 'Garage', createdAt: new Date() });
    const result = await importService.confirmImport('u1', [
      row({ cellar: 'garage' }),
      row({ name: 'Le Pin', producer: 'Le Pin', cellar: 'Cuisine' }),
      row({ name: 'Le Pin', producer: 'Le Pin', cellar: 'cuisine', quantity: 2 }),
      row({ category: 'cigar', name: 'Robusto', producer: 'Cohiba', vintage: undefined, cellar: 'Humidor' }),
    ], null);
    expect(result.createdCellars).toEqual(['Cuisine', 'Humidor']);
    expect(db.cellars.map(({ name, type }) => [name, type])).toEqual([['Garage', undefined], ['Cuisine', undefined], ['Humidor', 'HUMIDOR']]);
    const cellarName = (id: string | null) => db.cellars.find((cellar) => cellar.id === id)?.name;
    expect(units().map((u) => [cellarName(u.cellarId), u.quantity])).toEqual([['Garage', 1], ['Cuisine', 3], ['Humidor', 1]]);
  });

  it('creates no cellar for lines it leaves out', async () => {
    existingWine('Pétrus', 4);
    const result = await importService.confirmImport('u1', [row({ cellar: 'Cuisine' })], null);
    expect(result.createdCellars).toEqual([]);
    expect(tx.cellar.create).not.toHaveBeenCalled();
  });

  // FEAT-95.
  it('reads a cigar row as closed boxes, single cigars, or one box of its quantity without a box column', async () => {
    const cigar = (overrides: Partial<CsvImportRow>) => row({ category: 'cigar', vintage: undefined, name: 'Robusto', producer: 'Cohiba', ...overrides });
    const result = await importService.confirmImport('u1', [
      cigar({ quantity: 3, cigarsPerBox: 25 }),
      cigar({ quantity: 4, cigarsPerBox: 'single' }),
      cigar({ quantity: 10 }),
      cigar({ quantity: 10 }),
    ], null);
    expect(units().map(({ quantity, cigarsPerBox }) => [quantity, cigarsPerBox])).toEqual([[3, 25], [4, null], [2, 10]]);
    expect(result).toMatchObject({ cigars: 75 + 4 + 20, cigarReferences: 1, bottles: 0, wines: 0 });
  });

  it('keeps a cigar\'s vitola in its family', async () => {
    await importService.confirmImport('u1', [
      row({ category: 'cigar', vintage: undefined, name: 'Behike', producer: 'Cohiba', format: '52' }),
      row({ category: 'cigar', vintage: undefined, name: 'Behike', producer: 'Cohiba', format: '56' }),
    ], null);
    expect(db.products.map((p) => p.format)).toEqual(['52', '56']);
  });

  // Lock order (#787 review): families first, sorted, before any write.
  it('locks every family it may write to, in order, before writing', async () => {
    existingWine('Zeta', 0, { id: 'b-family', name: 'Zeta' });
    existingWine('Alpha', 0, { id: 'a-family', name: 'Alpha' });
    await importService.confirmImport('u1', [row({ name: 'Zeta' }), row({ name: 'Alpha' }), row({ name: 'New' })], null);
    expect(db.log.slice(0, 3)).toEqual(['advisory lock', 'lock a-family', 'lock b-family']);
    expect(db.log.slice(3)).toEqual(['create unit ×1', 'create unit ×1', 'create family New', 'create unit ×1']);
  });

  it('imports a spirit without an ABV column with no made-up 0 %, and stores no spirit vintage (#510)', async () => {
    await importService.confirmImport('u1', [row({ category: 'spirit', name: 'Lagavulin', vintage: 2010 })], null);
    expect(db.products[0]).not.toHaveProperty('alcoholDegree');
    expect(db.products[0].vintage).toBeNull();
  });

  // FEAT-05 honesty: a field is tagged "from the CSV file" only if its value is saved.
  it('tags only the values the file gave, on the family and on the line', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 6, alcoholDegree: 13.5, purchasePrice: 12 }),
      row({ category: 'cigar', vintage: undefined, name: 'Robusto', producer: 'Cohiba', quantity: 25 }),
    ], null);
    expect(db.products[0].fieldSources).toEqual({ name: 'import_csv', producer: 'import_csv', vintage: 'import_csv' });
    expect(db.units[0].fieldSources).toEqual({ purchasePrice: 'import_csv', quantity: 'import_csv' });
    expect(db.units[1].fieldSources).toEqual({ cigarsPerBox: 'import_csv' });
  });

  it('reads the stock once for the whole file, not once per row', async () => {
    existingWine('Pétrus', 0);
    await importService.confirmImport('u1', [row(), row({ name: 'Le Pin' }), row({ category: 'spirit', name: 'Lagavulin' })], null);
    const stockReads = tx.inventoryItem.findMany.mock.calls.filter(([args]) => typeof args.where.productId !== 'string');
    expect(stockReads).toHaveLength(1);
  });
});

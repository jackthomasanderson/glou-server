import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #471 (FEAT-99): an in-memory stand-in for the few tables the import reads
 * and writes, so that the aggregation, the family matching, the lock order
 * and a second "Confirm" are checked on their outcome, not on call counts.
 * The SQL filters themselves run on a real database in e2e/tests/csv-import.spec.ts.
 */
interface FakeProduct { id: string; category: string; name: string; producer: string; vintage: number | null; format: string | null; deletedAt: Date | null; createdAt: Date; [field: string]: unknown }
interface FakeUnit { id: string; productId: string; quantity: number; isOpened: boolean; fillLevel: number | null; cigarsPerBox: number | null; cigarsLeft: number | null; writtenOffAt: Date | null; deletedAt: Date | null; cellarId: string | null; purchasePrice: number | null; purchasedAt: Date | null; bottleSize: string | null; createdAt: Date; [field: string]: unknown }

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
    findMany: vi.fn(async ({ where }: { where: { productId: string | { in: string[] }; needsReview?: boolean } }) =>
      db.units.filter((u) => u.deletedAt === null && u.writtenOffAt === null && (where.needsReview === undefined || (u.needsReview ?? false) === where.needsReview)
        && (typeof where.productId === 'string' ? u.productId === where.productId : where.productId.in.includes(u.productId)))),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const unit = {
        isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null, deletedAt: null,
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
import { csvLineKey, type CsvImportRow } from '../../../shared/import';

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
      cigarsLeft: null, writtenOffAt: null, deletedAt: null, cellarId: 'cellar-1', purchasePrice: 20,
      purchasedAt: new Date('2025-01-01T00:00:00Z'), bottleSize: null, createdAt: new Date('2025-01-01'),
      purchasePlace: null, location: null, estimatedValue: null, needsReview: false,
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

  it('marks identical rows that add up past one group\'s bound', async () => {
    const preview = await importService.preview(csv('name,producer,category,quantity\nA,B,wine,600\nA,B,wine,600\nC,D,wine,1000\n'));
    expect(preview.lines.map((line) => [line.count, line.tooLarge])).toEqual([[1200, true], [1000, false]]);
  });

  it('announces only the cellars of lines written as they stand', async () => {
    existingWine('Pétrus', 4);
    const preview = await importService.preview(csv(
      'name,producer,category,vintage,cellar\nPétrus,Château Pétrus,wine,2015,Cuisine\nLe Pin,Le Pin,wine,2016,Garage\n',
    ));
    expect(preview.newCellars).toEqual(['Garage']);
    expect(preview.lines.map((line) => line.newCellar)).toEqual([true, true]);
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
    expect(result).toEqual({ bottles: 6, wines: 1, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, staleLines: 0, createdCellars: [] });
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
    // Le Pin is now in the cellar (ignored); Pétrus' stock is no longer the one shown (stale).
    expect(second).toMatchObject({ bottles: 0, wines: 0, skippedLines: 1, skippedUnits: 6, staleLines: 1 });
    expect(db.units.reduce((n, u) => n + u.quantity, 0)).toBe(13);
  });

  // Review of #794: several families of one key are a normal state.
  it('reads the stock of every family of the wine, and joins the oldest', async () => {
    const oldest = existingWine('Pétrus', 0, { id: 'z-old', createdAt: new Date('2024-01-01') });
    existingWine('Pétrus-recent', 6, { id: 'a-recent', name: 'Pétrus', createdAt: new Date('2025-06-01') });
    const file = csv('name,producer,category,vintage,quantity\nPétrus,Château Pétrus,wine,2015,6\n');

    const [line] = (await importService.preview(file)).lines;
    expect(line.inStock).toBe(6);

    const ignored = await importService.confirmImport('u1', [row({ quantity: 6 })], null);
    expect(ignored).toMatchObject({ bottles: 0, skippedLines: 1 });

    db.log = [];
    const added = await importService.confirmImport('u1', [row({ quantity: 6 })], null, [{ key: line.key, inStock: 6, add: true }]);
    expect(added).toMatchObject({ bottles: 6, wines: 1 });
    expect(db.log.slice(0, 3)).toEqual(['advisory lock', 'lock a-recent', 'lock z-old']);
    expect(db.units.filter((u) => u.productId === oldest.id).map((u) => u.quantity)).toEqual([6]);
  });

  it('leaves out a line chosen for adding whose stock changed since the preview, and says so', async () => {
    existingWine('Pétrus', 4);
    const [line] = (await importService.preview(csv('name,producer,category,vintage\nPétrus,Château Pétrus,wine,2015\n'))).lines;
    db.units[0].quantity = 5;

    const result = await importService.confirmImport('u1', [row()], null, [{ key: line.key, inStock: 4, add: true }]);

    expect(result).toMatchObject({ bottles: 0, staleLines: 1, skippedLines: 0 });
  });

  it('keeps "ignore" when the stock went away since the preview', async () => {
    existingWine('Pétrus', 4);
    const [line] = (await importService.preview(csv('name,producer,category,vintage\nPétrus,Château Pétrus,wine,2015\n'))).lines;
    db.units = [];

    const result = await importService.confirmImport('u1', [row()], null, [{ key: line.key, inStock: 4, add: false }]);

    expect(result).toMatchObject({ bottles: 0, skippedLines: 1, staleLines: 0 });
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

describe('opened bottles and boxes (FEAT-99 export)', () => {
  it('reads the opened, level and cigars-left columns, in English and in French', () => {
    const result = importService.previewCsv(csv([
      'name,producer,category,quantity,opened,fill level,cigars left,cigars per box',
      'A,P,wine,,yes,40,,',
      'B,P,cigar,,oui,,7,20',
    ].join('\n')));
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'A', producer: 'P', category: 'wine', opened: true, fillLevel: 40 },
      { name: 'B', producer: 'P', category: 'cigar', opened: true, cigarsLeft: 7, cigarsPerBox: 20 },
    ]);
    const french = importService.previewCsv(csv('Nom;Producteur;Catégorie;Entamée;Niveau de remplissage\nA;P;vin;oui;60\n'));
    expect(french.valid).toEqual([{ name: 'A', producer: 'P', category: 'wine', opened: true, fillLevel: 60 }]);
  });

  it('refuses a level of 0 (a finished bottle), more cigars left than the box holds, and several opened at once', () => {
    const { errors } = importService.previewCsv(csv([
      'name,producer,category,quantity,opened,fill level,cigars left,cigars per box',
      'A,P,wine,,yes,0,,',
      'B,P,cigar,,yes,,30,20',
      'C,P,wine,3,yes,50,,',
    ].join('\n')));
    expect(errors).toEqual([{ row: 2, reason: 'INVALID_FILL_LEVEL' }, { row: 3, reason: 'CIGARS_LEFT_ABOVE_BOX' }, { row: 4, reason: 'INVALID_QUANTITY' }]);
  });

  it('gives back a text cell that the export prefixed against a formula', () => {
    const { valid } = importService.previewCsv(csv("name,producer,category\n'=SUM(A1),'-Dash,wine\n"));
    expect(valid[0]).toMatchObject({ name: '=SUM(A1)', producer: '-Dash' });
  });

  it('writes an opened bottle as its own unit next to the group, never into it', async () => {
    const result = await importService.confirmImport('u1', [
      row({ quantity: 4 }),
      row({ opened: true, fillLevel: 40 }),
      row({ opened: true }),
    ], null);
    expect(result).toMatchObject({ bottles: 6, wines: 1 });
    expect(db.products).toHaveLength(1);
    expect(db.units.map((u) => [u.quantity, u.isOpened, u.fillLevel])).toEqual([[4, false, null], [1, true, 40], [1, true, null]]);
  });

  it('writes an opened box with the cigars left, counted as those cigars', async () => {
    const result = await importService.confirmImport('u1', [
      row({ category: 'cigar', name: 'Robusto', vintage: undefined, quantity: 2, cigarsPerBox: 20 }),
      row({ category: 'cigar', name: 'Robusto', vintage: undefined, opened: true, cigarsPerBox: 20, cigarsLeft: 7 }),
    ], null);
    expect(result).toMatchObject({ cigars: 47, cigarReferences: 1 });
    expect(db.units.map((u) => [u.quantity, u.cigarsPerBox, u.isOpened, u.cigarsLeft])).toEqual([[2, 20, false, null], [1, 20, true, 7]]);
  });
});

describe('FEAT-99 export: nothing lost on the way back', () => {
  it('keeps apart two groups that differ only by place of purchase or location, and by estimated value', async () => {
    const result = await importService.confirmImport('u1', [
      row({ quantity: 4, purchasePrice: 20, purchasedAt: '2024-01-15', purchasePlace: 'Nicolas' }),
      row({ quantity: 2, purchasePrice: 20, purchasedAt: '2024-01-15', purchasePlace: 'Salon des vins' }),
      row({ quantity: 3, purchasePrice: 20, purchasedAt: '2024-01-15', purchasePlace: 'Nicolas', location: 'Cave du bas' }),
      row({ quantity: 5, purchasePrice: 20, purchasedAt: '2024-01-15', purchasePlace: 'nicolas ', estimatedValue: 60 }),
    ], null);
    expect(result.bottles).toBe(14);
    expect(db.units.map((u) => [u.quantity, u.purchasePlace, u.location, u.estimatedValue])).toEqual([
      [4, 'Nicolas', null, null], [2, 'Salon des vins', null, null], [3, 'Nicolas', 'Cave du bas', null], [5, 'nicolas ', null, 60],
    ]);
  });

  it('adds up identical lines of the same place', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 4, purchasedAt: '2024-01-15', purchasePlace: 'Nicolas' }),
      row({ quantity: 2, purchasedAt: '2024-01-15', purchasePlace: ' NICOLAS' }),
    ], null);
    expect(db.units.map((u) => u.quantity)).toEqual([6]);
  });

  it('never completes a group of another place or estimated value in the cellar', async () => {
    existingWine('Pétrus', 4);
    Object.assign(db.units[0], { purchasePlace: 'Nicolas' });
    const salon = row({ purchasePrice: 20, purchasedAt: '2025-01-01', purchasePlace: 'Salon' });
    const valued = row({ purchasePrice: 20, purchasedAt: '2025-01-01', estimatedValue: 50, purchasePlace: 'Nicolas' });
    await importService.confirmImport('u1', [salon], null, [{ key: csvLineKey(salon), inStock: 4, add: true }]);
    await importService.confirmImport('u1', [valued], null, [{ key: csvLineKey(valued), inStock: 5, add: true }]);
    expect(db.units.map((u) => u.quantity)).toEqual([4, 1, 1]);
  });

  it('writes the opening day of an opened unit and a unit still to review on its own', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 3, purchasedAt: '2024-01-15' }),
      row({ opened: true, fillLevel: 50, openedAt: '2025-02-03' }),
      row({ quantity: 2, purchasedAt: '2024-01-15', needsReview: true }),
    ], null);
    expect(db.units.map((u) => [u.quantity, u.isOpened, u.openedAt, u.needsReview])).toEqual([
      [3, false, undefined, false], [1, true, new Date('2025-02-03T00:00:00Z'), false], [2, false, undefined, true],
    ]);
  });

  it('creates the family with its description, once, from its first row', async () => {
    await importService.confirmImport('u1', [
      row({ quantity: 2, color: 'red', appellation: 'Saint-Émilion', grapeVarieties: ['Merlot', 'Cabernet'], tags: ['fête'], notes: 'À garder', peakMaturityFrom: 2025, peakMaturityTo: 2035, needsAeration: true, batchDate: '2020-05-01' }),
      row({ quantity: 1, purchasedAt: '2024-01-15', color: 'white' }),
    ], null);
    expect(db.products).toHaveLength(1);
    expect(db.products[0]).toMatchObject({
      color: 'red', appellation: 'Saint-Émilion', grapeVarieties: ['Merlot', 'Cabernet'], tags: ['fête'], notes: 'À garder',
      peakMaturityFrom: 2025, peakMaturityTo: 2035, needsAeration: true, batchDate: new Date('2020-05-01T00:00:00Z'),
    });
  });

  // #593: a spirit or a cigar has no drinking window, even from a "drink from" column.
  it('creates a spirit or a cigar without the drinking window of its row, and without an alert', async () => {
    const year = new Date().getFullYear();
    await importService.confirmImport('u1', [
      row({ name: 'Lagavulin 16', category: 'spirit', vintage: undefined, alcoholDegree: 43, peakMaturityFrom: year - 1, peakMaturityTo: year + 3 }),
      row({ name: 'Robusto', category: 'cigar', vintage: undefined, peakMaturityFrom: year - 1, peakMaturityTo: year + 3 }),
    ], null);
    expect(db.products).toHaveLength(2);
    for (const family of db.products) {
      expect(family).not.toHaveProperty('peakMaturityFrom');
      expect(family).not.toHaveProperty('peakMaturityTo');
      expect(family).toMatchObject({ alertStatus: 'none' });
      expect(family.fieldSources).not.toHaveProperty('peakMaturityFrom');
    }
  });

  it('reads the new columns with their English and French headers, lists split on |', () => {
    const { valid, errors } = importService.previewCsv(csv([
      "Nom;Producteur;Catégorie;Lieu d'achat;Emplacement;Valeur estimée;Date d'ouverture;Entamée;À vérifier;Couleur;Cépages;Étiquettes;Notes",
      'A;P;vin;Nicolas;Cave;12,5;2025-02-03;oui;oui;Rouge;Merlot|Syrah;a|b;"deux\nlignes"',
    ].join('\n')));
    expect(errors).toEqual([]);
    expect(valid[0]).toEqual({
      name: 'A', producer: 'P', category: 'wine', purchasePlace: 'Nicolas', location: 'Cave', estimatedValue: 12.5,
      openedAt: '2025-02-03', opened: true, needsReview: true, color: 'red', grapeVarieties: ['Merlot', 'Syrah'], tags: ['a', 'b'], notes: 'deux\nlignes',
    });
  });

  it('leaves out an unknown colour or sugar level, and a reversed drinking window, instead of refusing the row', () => {
    const { valid, errors } = importService.previewCsv(csv('name,producer,category,color,sugar level,drink from,drink until\nA,P,wine,bordeaux,sirupeux,,\nB,P,wine,red,,2030,2020\n'));
    expect(errors).toEqual([]);
    expect(valid).toEqual([
      { name: 'A', producer: 'P', category: 'wine' },
      { name: 'B', producer: 'P', category: 'wine', color: 'red' },
    ]);
  });

  it('keeps the row of a file from other software whose description cells are not what the importer expects', () => {
    const { valid, errors } = importService.previewCsv(csv([
      'Nom,Producteur,Catégorie,Aération,Fût unique,À boire à partir de,À boire jusqu\'en,Année de base,Notes,Cépages',
      `A,P,vin,1 h,peut-être,2025-2030,bientôt,vieille,${'x'.repeat(2500)},Merlot|${'y'.repeat(150)}`,
    ].join('\n')));
    expect(errors).toEqual([]);
    expect(valid).toEqual([{ name: 'A', producer: 'P', category: 'wine', notes: 'x'.repeat(2000) }]);
  });

  it('adds the copies of a line to the group of the cellar it names, however the line was written (no cellar column, no date)', async () => {
    db.cellars.push({ id: 'cellar-1', name: 'Cave', createdAt: new Date() });
    await importService.confirmImport('u1', [
      row({ quantity: 3, purchasePrice: 20 }),
      row({ quantity: 2, purchasePrice: 20, cellar: 'Cave' }),
    ], 'cellar-1');
    expect(db.units.map((u) => [u.quantity, u.cellarId])).toEqual([[5, 'cellar-1']]);

    db.units = [];
    await importService.confirmImport('u1', [
      row({ quantity: 3, purchasePrice: 20 }),
      row({ quantity: 2, purchasePrice: 20, purchasedAt: new Date().toLocaleDateString('en-CA') }),
    ], 'cellar-1');
    expect(db.units.map((u) => u.quantity)).toEqual([5]);
  });

  it('carries the place of purchase and location of the line onto the group it completes, when the group has none', async () => {
    existingWine('Pétrus', 3);
    db.cellars.push({ id: 'cellar-1', name: 'Cave', createdAt: new Date() });
    const salon = row({ cellar: 'Cave', purchasePrice: 20, purchasedAt: '2025-01-01', quantity: 2, purchasePlace: 'Salon', location: 'Étagère 2' });
    await importService.confirmImport('u1', [salon], null, [{ key: csvLineKey(salon), inStock: 3, add: true }]);
    expect(db.units.map((u) => [u.quantity, u.purchasePlace, u.location])).toEqual([[5, 'Salon', 'Étagère 2']]);
  });

  it('keeps the place a group already has when the line gives none', async () => {
    existingWine('Pétrus', 3);
    Object.assign(db.units[0], { purchasePlace: 'Nicolas' });
    db.cellars.push({ id: 'cellar-1', name: 'Cave', createdAt: new Date() });
    const line = row({ cellar: 'Cave', purchasePrice: 20, purchasedAt: '2025-01-01', quantity: 2, location: 'Cave' });
    await importService.confirmImport('u1', [line], null, [{ key: csvLineKey(line), inStock: 3, add: true }]);
    expect(db.units.map((u) => [u.quantity, u.purchasePlace, u.location])).toEqual([[5, 'Nicolas', 'Cave']]);
  });

  it('never completes a group still to review', async () => {
    existingWine('Pétrus', 3);
    Object.assign(db.units[0], { needsReview: true });
    const line = row({ purchasePrice: 20, purchasedAt: '2025-01-01', quantity: 2 });
    await importService.confirmImport('u1', [line], null, [{ key: csvLineKey(line), inStock: 3, add: true }]);
    expect(db.units.map((u) => [u.quantity, u.needsReview])).toEqual([[3, true], [2, false]]);
  });

  it('does not take an old file\'s "Niveau", "Level", "Open" or "Restants" column for the opened columns', () => {
    const { valid, errors } = importService.previewCsv(csv('Nom,Producteur,Catégorie,Niveau,Level,Open,Restants\nA,P,vin,Haut,x,y,z\n'));
    expect(errors).toEqual([]);
    expect(valid).toEqual([{ name: 'A', producer: 'P', category: 'wine' }]);
  });

  it('ignores a level, cigars left or opening day on a row that is not opened', () => {
    const { valid, errors } = importService.previewCsv(csv('name,producer,category,opened,fill level,cigars left,opened on\nA,P,wine,,0,abc,nope\nB,P,wine,no,50,3,2025-01-01\n'));
    expect(errors).toEqual([]);
    expect(valid).toEqual([{ name: 'A', producer: 'P', category: 'wine' }, { name: 'B', producer: 'P', category: 'wine', opened: false }]);
  });
});


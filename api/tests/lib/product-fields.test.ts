import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import {
  compareFamilyIds, lockFamilies, PRODUCT_FIELDS, pickProductFields, todayAsPurchaseDate, toItemView, writeAlertStatus, writeProductFields,
} from '../../src/lib/product-fields';

const migrationsDir = path.join(__dirname, '../../prisma/migrations');
const migration = (suffix: string) => {
  const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith(suffix));
  if (!dir) throw new Error(`${suffix} migration not found`);
  return fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
};
const familiesMigration = () => migration('_families_model');

describe('PRODUCT_FIELDS (#471, design.md "Où vit une donnée")', () => {
  it('lists only real columns of Product', () => {
    const productColumns = Object.values(Prisma.ProductScalarFieldEnum) as string[];
    for (const field of PRODUCT_FIELDS) expect(productColumns).toContain(field);
  });

  it('lists no column of the unit: the description lives on the family only (lot Z)', () => {
    const itemColumns = Object.values(Prisma.InventoryItemScalarFieldEnum) as string[];
    for (const field of PRODUCT_FIELDS) expect(itemColumns).not.toContain(field);
  });

  it('leaves what depends on the physical unit on the item', () => {
    for (const field of [
      'cellarId', 'slotColumn', 'slotRow', 'location', 'purchasePrice', 'estimatedValue',
      'purchasePlace', 'purchasedAt', 'bottleSize', 'quantity', 'isOpened', 'fillLevel', 'openedAt',
      'deletedAt', 'userId', 'updatedBy', 'lockedFields', 'fieldSources',
    ]) {
      expect(PRODUCT_FIELDS as readonly string[]).not.toContain(field);
    }
  });

  it('puts the whole technical sheet and the legacy collection label on the family (D1/D19)', () => {
    for (const field of [
      'lotNumber', 'batchDate', 'disgorgingDate', 'caskNumber', 'isSingleCask', 'caskProof',
      'factoryCode', 'manufactureYear', 'collection', 'notes', 'tags', 'photoUrl', 'alertStatus',
      'alertsPaused', 'consumptionPostponedUntil', 'reminderDate', 'curveShape',
    ]) {
      expect(PRODUCT_FIELDS as readonly string[]).toContain(field);
    }
  });

  it('is copied in full by the expansion, in both the insert and the lock filter', () => {
    const sql = familiesMigration();
    const insert = sql.slice(sql.indexOf('INSERT INTO "products"'), sql.indexOf('FROM "bottles"'));
    const lockList = sql.slice(sql.indexOf('product_fields'), sql.indexOf(']', sql.indexOf('product_fields')));
    for (const field of PRODUCT_FIELDS) {
      expect(insert).toContain(`"${field}"`);
      expect(lockList).toContain(`'${field}'`);
    }
  });

  it('is merged in full by the transformation, then dropped from bottles by the contraction (FEAT-94)', () => {
    const sql = familiesMigration();
    const merge = sql.slice(sql.indexOf('UPDATE "products" p SET'), sql.indexOf('FROM fam_merged f'));
    const contraction = sql.slice(sql.indexOf('ALTER TABLE "bottles" DROP COLUMN'), sql.indexOf('DROP TABLE "_CollectionItems"'));
    expect(merge.length).toBeGreaterThan(0);
    expect(contraction.length).toBeGreaterThan(0);
    // The key fields stay the surviving family's own (equal once normalised);
    // the alert status is recomputed from the merged drinking window.
    expect(merge).toContain('"alertStatus" = CASE');
    for (const field of PRODUCT_FIELDS) {
      if (!['category', 'name', 'producer', 'alertStatus'].includes(field)) {
        expect(merge).toContain(`"${field}" = f."${field}"`);
      }
      expect(contraction).toContain(`DROP COLUMN "${field}"`);
    }
    expect(contraction).toContain('DROP COLUMN "isOwned"');
  });

  // Found by name, never as "the last one": later migrations ship after it
  // (FEAT-93's item_slots, #851).
  it('is one migration, without an explicit transaction (D7, design.md)', () => {
    const names = fs.readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name)).sort();
    expect(names.filter((name) => name.includes('_families'))).toEqual(['20261104120000_families_model']);
    const statements = familiesMigration().replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i);
    expect(statements).not.toMatch(/CONCURRENTLY|VACUUM/i);
  });

  // FEAT-93: the slots migration, after the families one, also in one implicit
  // transaction, and with the families rules block copied verbatim (the bench
  // checks it byte for byte too).
  it('the slots migration follows it, without an explicit transaction, with the same rules block', () => {
    const names = fs.readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name)).sort();
    const slots = names.filter((name) => name.endsWith('_item_slots'));
    expect(slots).toHaveLength(1);
    expect(slots[0] > '20261104120000_families_model').toBe(true);
    const sql = migration('_item_slots');
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i);
    expect(statements).not.toMatch(/CONCURRENTLY|VACUUM/i);
    const rules = (text: string) => text.slice(text.indexOf('-- >>> families rules'), text.indexOf('-- <<< families rules'));
    expect(rules(sql)).not.toBe('');
    expect(rules(sql)).toBe(rules(familiesMigration()));
    expect(sql).toContain('DROP COLUMN "slotColumn"');
    expect(sql).toContain('DROP COLUMN "slotRow"');
  });
});

describe('pickProductFields', () => {
  it('keeps the family fields that are set, including an explicit null', () => {
    expect(pickProductFields({ name: 'Talbot', region: null, purchasePrice: 20, cellarId: 'c1' }))
      .toEqual({ name: 'Talbot', region: null });
  });

  it('drops undefined values', () => {
    expect(pickProductFields({ name: 'Talbot', region: undefined })).toEqual({ name: 'Talbot' });
  });
});

describe('todayAsPurchaseDate (D6)', () => {
  it('is today in the API time zone, at midnight UTC so a @db.Date column stores that day', () => {
    const now = new Date(2026, 0, 15, 0, 30); // 00:30 local time
    expect(todayAsPurchaseDate(now).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
});

describe('writeProductFields (#471, D22)', () => {
  it('writes the family only: its units carry no copy, their updatedAt is left alone', async () => {
    const client = { product: { update: vi.fn(async () => ({ id: 'p1' })) }, $executeRaw: vi.fn() };

    await writeProductFields(client as never, 'p1', { region: 'Médoc', updatedBy: 'u1' });

    expect(client.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { region: 'Médoc', updatedBy: 'u1' } });
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});

// #471 (A1 review): the calendar moves the alert, not an edit — no `updatedAt`
// moves, and none read earlier is carried back.
describe('writeAlertStatus', () => {
  it('writes the family in SQL, without any updatedAt', async () => {
    const client = { $executeRaw: vi.fn() };

    await writeAlertStatus(client as never, 'p1', 'peak');

    const statements = client.$executeRaw.mock.calls.map(([sql, ...values]) => ({ sql: (sql as string[]).join('?'), values }));
    expect(statements).toEqual([
      { sql: expect.stringContaining('UPDATE "products" SET "alertStatus"'), values: ['peak', 'p1'] },
    ]);
    for (const { sql } of statements) expect(sql).not.toContain('updatedAt');
  });
});

describe('toItemView (#471: the flat record of /api/inventory)', () => {
  const product = {
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    name: 'Talbot', region: 'Médoc', lockedFields: ['region'], fieldSources: { name: 'ocr' }, collections: [{ id: 'col1' }],
  };

  it('reads the description, its locks, sources and collections on the family, the rest on the unit', () => {
    const view = toItemView({
      id: 'b1', purchasePrice: 20, name: 'stale', region: 'stale',
      lockedFields: ['region', 'purchasePrice'], fieldSources: { region: 'ocr', purchasePrice: 'import_csv' },
      product: product as never,
    });

    expect(view).toMatchObject({
      id: 'b1', purchasePrice: 20, name: 'Talbot', region: 'Médoc', collections: [{ id: 'col1' }],
      fieldSources: { purchasePrice: 'import_csv', name: 'ocr' },
    });
    expect(view.lockedFields).toEqual(['region', 'purchasePrice']);
    expect(view).not.toHaveProperty('product');
  });

  it('has no field sources when neither side has any', () => {
    const view = toItemView({ lockedFields: [], fieldSources: null, product: { ...product, fieldSources: null } as never });
    expect(view.fieldSources).toBeNull();
  });
});

describe('lockFamilies (lock order, #787 review)', () => {
  it('locks each family once, by code unit, whatever the order given', async () => {
    const queryRaw = vi.fn();
    await lockFamilies({ $queryRaw: queryRaw } as never, ['p2', 'P9', 'p1', 'p2']);

    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual(['P9', 'p1', 'p2']);
  });

  it('orders ids by code unit, never by locale', () => {
    expect(['b', 'B', 'a'].sort(compareFamilyIds)).toEqual(['B', 'a', 'b']);
  });
});

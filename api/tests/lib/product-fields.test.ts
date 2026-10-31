import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import {
  PRODUCT_FIELDS, pickProductFields, todayAsPurchaseDate, toItemView, writeProductFields,
} from '../../src/lib/product-fields';

const migrationsDir = path.join(__dirname, '../../prisma/migrations');
const migration = (suffix: string) => {
  const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith(suffix));
  if (!dir) throw new Error(`${suffix} migration not found`);
  return fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
};
const expandMigration = () => migration('_families_expand');

describe('PRODUCT_FIELDS (#471, design.md "Où vit une donnée")', () => {
  it('lists only real columns of Product', () => {
    const productColumns = Object.values(Prisma.ProductScalarFieldEnum) as string[];
    for (const field of PRODUCT_FIELDS) expect(productColumns).toContain(field);
  });

  it('lists only columns still mirrored on bottles, so the expansion can copy them', () => {
    const itemColumns = Object.values(Prisma.InventoryItemScalarFieldEnum) as string[];
    for (const field of PRODUCT_FIELDS) expect(itemColumns).toContain(field);
  });

  it('leaves what depends on the physical unit on the item', () => {
    for (const field of [
      'cellarId', 'slotColumn', 'slotRow', 'location', 'purchasePrice', 'estimatedValue',
      'purchasePlace', 'purchasedAt', 'bottleSize', 'quantity', 'isOpened', 'fillLevel', 'openedAt',
      'isOwned', 'deletedAt', 'userId', 'updatedBy', 'lockedFields', 'fieldSources',
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

  it('is copied in full by the expansion migration, in both the insert and the lock filter', () => {
    const sql = expandMigration();
    const insert = sql.slice(sql.indexOf('INSERT INTO "products"'), sql.indexOf('FROM "bottles"'));
    const lockList = sql.slice(sql.indexOf('product_fields'), sql.indexOf(']', sql.indexOf('product_fields')));
    for (const field of PRODUCT_FIELDS) {
      expect(insert).toContain(`"${field}"`);
      expect(lockList).toContain(`'${field}'`);
    }
  });

  it('is merged and mirrored again in full by the transform migration (FEAT-94)', () => {
    const sql = migration('_families_transform');
    const merge = sql.slice(sql.indexOf('UPDATE "products" p SET'), sql.indexOf('FROM fam_merged f'));
    const mirror = sql.slice(sql.indexOf('UPDATE "bottles" b SET\n  "category"'), sql.indexOf('FROM "products" p\nWHERE b."productId"'));
    expect(merge.length).toBeGreaterThan(0);
    expect(mirror.length).toBeGreaterThan(0);
    // The key fields stay the surviving family's own (equal once normalised);
    // the alert status is recomputed from the merged drinking window.
    expect(merge).toContain('"alertStatus" = CASE');
    for (const field of PRODUCT_FIELDS) {
      if (!['category', 'name', 'producer', 'alertStatus'].includes(field)) {
        expect(merge).toContain(`"${field}" = f."${field}"`);
      }
      expect(mirror).toContain(`"${field}" = p."${field}"`);
    }
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
  it('writes the family, then copies every family column onto its units in SQL, leaving their updatedAt alone', async () => {
    const calls: string[] = [];
    const client = {
      product: { update: vi.fn(async () => { calls.push('product'); return { id: 'p1' }; }) },
      $executeRaw: vi.fn(async () => { calls.push('mirror'); return 2; }),
    };

    await writeProductFields(client as never, 'p1', { region: 'Médoc', updatedBy: 'u1' });

    expect(client.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { region: 'Médoc', updatedBy: 'u1' } });
    expect(calls).toEqual(['product', 'mirror']);
    const [strings, assignments, productId] = client.$executeRaw.mock.calls[0] as unknown as [string[], { text?: string; sql?: string }, string];
    const sql = `${strings.join('?')} ${JSON.stringify(assignments)}`;
    expect(sql).toContain('UPDATE "bottles"');
    expect(sql).not.toContain('updatedAt');
    for (const field of PRODUCT_FIELDS) expect(sql).toContain(`\\"${field}\\" = p.\\"${field}\\"`);
    expect(productId).toBe('p1');
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

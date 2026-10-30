import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { PRODUCT_FIELDS, pickProductFields, todayAsPurchaseDate } from '../../src/lib/product-fields';

const migrationsDir = path.join(__dirname, '../../prisma/migrations');
const expandMigration = () => {
  const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith('_families_expand'));
  if (!dir) throw new Error('families_expand migration not found');
  return fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
};

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

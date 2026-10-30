import { describe, it, expect } from 'vitest';
import { createCellarSchema, updateCellarSchema, swapSlotsSchema } from '../../src/schemas/cellar.schema';
import { maturityReferenceSchema, maturityReferencePatchSchema } from '../../src/schemas/maturity-reference.schema';
import { wishlistCreateSchema, wishlistPatchSchema } from '../../src/schemas/wishlist.schema';
import { csvRawRowSchema } from '../../src/schemas/import.schema';

// zod 4 applies a field's .default() even when the field sits under
// .partial(). A PATCH that omits a defaulted field must leave it out, or the
// update silently resets it (a renamed cellar would lose its type).
describe('patch schemas never reintroduce create-time defaults', () => {
  it('cellar: renaming keeps the type', () => {
    const res = updateCellarSchema.parse({ name: 'Garage' });
    expect(res).toEqual({ name: 'Garage' });
    expect(createCellarSchema.parse({ name: 'Garage' }).type).toBe('VINTAGE');
  });

  it('maturity reference: a partial patch keeps curve shape and priority', () => {
    expect(maturityReferencePatchSchema.parse({ name: 'Bordeaux' })).toEqual({ name: 'Bordeaux' });
    const created = maturityReferenceSchema.parse({
      name: 'Bordeaux', category: 'wine', mode: 'RELATIVE', windowFrom: 5, windowTo: 15,
    });
    expect(created.curveShape).toBe('LINEAR');
    expect(created.priority).toBe(0);
  });

  it('wishlist: a status change keeps the target quantity', () => {
    expect(wishlistPatchSchema.parse({ status: 'acquired' })).toEqual({ status: 'acquired' });
    expect(wishlistCreateSchema.parse({ name: 'Yquem', category: 'wine' }).targetQuantity).toBe(1);
  });

  it('patch schemas still validate the fields they receive', () => {
    expect(updateCellarSchema.safeParse({ type: 'NOPE' }).success).toBe(false);
    expect(maturityReferencePatchSchema.safeParse({ priority: -1 }).success).toBe(false);
    expect(wishlistPatchSchema.safeParse({ targetQuantity: 0 }).success).toBe(false);
  });
});

describe('zod 4 migration keeps the v3 contract', () => {
  it('ids are checked as GUIDs, not as strict RFC UUIDs', () => {
    const res = swapSlotsSchema.safeParse({
      itemAId: '11111111-1111-1111-1111-111111111111',
      itemBId: '22222222-2222-2222-2222-222222222222',
    });
    expect(res.success).toBe(true);
    expect(swapSlotsSchema.safeParse({ itemAId: 'not-an-id', itemBId: 'x' }).success).toBe(false);
  });

  it('CSV import reports its own codes for unreadable numbers and categories', () => {
    const row = { name: 'Margaux', producer: 'Château', category: 'wine' };
    const price = csvRawRowSchema.safeParse({ ...row, purchasePrice: 'abc' });
    expect(price.success).toBe(false);
    if (!price.success) expect(price.error.issues[0].message).toBe('INVALID_PRICE');

    const category = csvRawRowSchema.safeParse({ ...row, category: 'beer' });
    expect(category.success).toBe(false);
    if (!category.success) expect(category.error.issues[0].message).toBe('INVALID_CATEGORY');

    const missing = csvRawRowSchema.safeParse({ name: 'Margaux', producer: 'Château' });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].message).toBe('INVALID_CATEGORY');

    expect(csvRawRowSchema.parse({ ...row, purchasePrice: '12,50 €' }).purchasePrice).toBe(12.5);
    expect(csvRawRowSchema.parse(row).purchasePrice).toBeUndefined();
  });
});

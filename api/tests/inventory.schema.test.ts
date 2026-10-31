import { describe, it, expect } from 'vitest';
import {
  inventoryInputSchema,
  guestInventoryUpdateSchema,
} from '../src/schemas/inventory.schema';

describe('inventoryInputSchema', () => {
  it('validates a minimal wine item', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Pétrus',
      producer: 'Château Pétrus',
    });
    expect(result.success).toBe(true);
  });

  it('validates a spirit with required alcoholDegree', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'spirit',
      name: 'Yamazaki 12',
      producer: 'Suntory',
      alcoholDegree: 43,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a spirit without alcoholDegree', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'spirit',
      name: 'Yamazaki 12',
      producer: 'Suntory',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a cigar without quantity', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'cigar',
      name: 'Romeo y Julieta',
      producer: 'Romeo y Julieta',
    });
    expect(result.success).toBe(false);
  });

  it('validates a cigar with quantity', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'cigar',
      name: 'Romeo y Julieta',
      producer: 'Romeo y Julieta',
      quantity: 25,
    });
    expect(result.success).toBe(true);
  });

  // ISSUE_101/ISSUE_029: an emptied box (quantity 0) is a real state, not a
  // forbidden one — only a negative count is invalid.
  it('validates a cigar with quantity 0 (an emptied box)', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'cigar',
      name: 'Romeo y Julieta',
      producer: 'Romeo y Julieta',
      quantity: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a cigar with a negative quantity', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'cigar',
      name: 'Romeo y Julieta',
      producer: 'Romeo y Julieta',
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'beer',
      name: 'Leffe',
      producer: 'Leffe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a vintage out of range', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Futuristic Wine',
      producer: 'Future Inc',
      vintage: 2099,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a wine without vintage (sans millésime)', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Sans Millésime',
      producer: 'Domaine X',
      vintage: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// FEAT-87: ownership is a structural field — it defaults to owned, and a
// guest with write access may not touch it.
describe('isOwned (FEAT-87)', () => {
  it('defaults a newly created item to owned', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Pétrus',
      producer: 'Château Pétrus',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isOwned).toBe(true);
  });

  it('accepts an item explicitly created as a non-owned reference', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Pétrus',
      producer: 'Château Pétrus',
      isOwned: false,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isOwned).toBe(false);
  });

  // #683: the form's "Reference" button clears the level and opening date to
  // null; the create schema used to reject that null, so no item could be added.
  it('accepts a reference sent by the form with a cleared level and opening date', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Sylvaner Tradition',
      producer: 'Bott Frères',
      isOwned: false,
      isOpened: false,
      fillLevel: null,
      openedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an owned item whose level was cleared by toggling Reference then back', () => {
    const result = inventoryInputSchema.safeParse({
      category: 'wine',
      name: 'Sylvaner Tradition',
      producer: 'Bott Frères',
      isOwned: true,
      fillLevel: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a guest trying to flip ownership', () => {
    const result = guestInventoryUpdateSchema.safeParse({ isOwned: false });
    expect(result.success).toBe(false);
  });
});

// #706: a drinking window ending before it starts was stored as is.
describe('peak window order (#706)', () => {
  const wine = { category: 'wine', name: 'Pétrus', producer: 'Château Pétrus' };

  it('rejects a window that ends before it starts, on peakMaturityTo', () => {
    const res = inventoryInputSchema.safeParse({ ...wine, peakMaturityFrom: 2035, peakMaturityTo: 2028 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].path).toEqual(['peakMaturityTo']);
    expect(
      inventoryInputSchema.safeParse({ ...wine, category: 'sparkling', peakMaturityFrom: 2035, peakMaturityTo: 2028 }).success,
    ).toBe(false);
  });

  it('accepts a one-year window and a window with only one end', () => {
    expect(inventoryInputSchema.safeParse({ ...wine, peakMaturityFrom: 2030, peakMaturityTo: 2030 }).success).toBe(true);
    expect(inventoryInputSchema.safeParse({ ...wine, peakMaturityFrom: 2030 }).success).toBe(true);
    expect(inventoryInputSchema.safeParse({ ...wine, peakMaturityFrom: 2030, peakMaturityTo: null }).success).toBe(true);
  });
});

// #726: a date typed then cleared in the add form is sent as null.
describe('cleared dates on creation (#726)', () => {
  it('keeps a null batch or disgorging date null instead of 1970-01-01', () => {
    const wine = inventoryInputSchema.safeParse({ category: 'wine', name: 'Pétrus', producer: 'Château Pétrus', batchDate: null });
    expect(wine.success && wine.data.batchDate).toBeNull();
    const sparkling = inventoryInputSchema.safeParse({ category: 'sparkling', name: 'Brut', producer: 'Maison', disgorgingDate: null });
    expect(sparkling.success && (sparkling.data as { disgorgingDate?: Date | null }).disgorgingDate).toBeNull();
  });
});

// #471 (FEAT-92 c1-c2, lot E1): the add form says how many identical bottles
// it stores and when they were bought — one group ×N, dated by its day.
describe('number of bottles and purchase day on creation (FEAT-92)', () => {
  const wine = { category: 'wine', name: 'Talbot', producer: 'Château Talbot' };

  it.each(['wine', 'sparkling', 'spirit'])('keeps the number of bottles of a %s', (category) => {
    const res = inventoryInputSchema.safeParse({ ...wine, category, alcoholDegree: 40, quantity: 6 });
    expect(res.success && res.data.quantity).toBe(6);
  });

  it('refuses no bottle at all, or more than one group may count', () => {
    expect(inventoryInputSchema.safeParse({ ...wine, quantity: 0 }).success).toBe(false);
    expect(inventoryInputSchema.safeParse({ ...wine, quantity: 1001 }).success).toBe(false);
    expect(inventoryInputSchema.safeParse({ ...wine, quantity: 2.5 }).success).toBe(false);
  });

  it('keeps the purchase day as YYYY-MM-DD (D6), and an emptied one as null', () => {
    const res = inventoryInputSchema.safeParse({ ...wine, purchasedAt: '2026-01-15' });
    expect(res.success && res.data.purchasedAt).toBe('2026-01-15');
    const cleared = inventoryInputSchema.safeParse({ ...wine, purchasedAt: null });
    expect(cleared.success && cleared.data.purchasedAt).toBeNull();
  });

  it('refuses a purchase day with a time or in another format', () => {
    expect(inventoryInputSchema.safeParse({ ...wine, purchasedAt: '2026-01-15T00:00:00.000Z' }).success).toBe(false);
    expect(inventoryInputSchema.safeParse({ ...wine, purchasedAt: '15/01/2026' }).success).toBe(false);
  });

  it('refuses several bottles created already opened: a group is intact', () => {
    const res = inventoryInputSchema.safeParse({ ...wine, quantity: 6, isOpened: true, fillLevel: 50 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]).toMatchObject({ path: ['quantity'], message: 'OPENED_GROUP' });
    expect(inventoryInputSchema.safeParse({ ...wine, quantity: 1, isOpened: true, fillLevel: 50 }).success).toBe(true);
  });
});

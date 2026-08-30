import { describe, it, expect } from 'vitest';
import {
  inventoryPatchSchema,
  guestInventoryUpdateSchema,
  rollbackFieldSchema,
} from '../../src/schemas/inventory.schema';

describe('inventoryPatchSchema', () => {
  it('accepts an empty patch (every field optional)', () => {
    expect(inventoryPatchSchema.safeParse({}).success).toBe(true);
  });

  it('allows nulling out nullable fields', () => {
    const res = inventoryPatchSchema.safeParse({ vintage: null, region: null, cellarId: null });
    expect(res.success).toBe(true);
  });

  it('normalizes cellarId "none"/"" to null via preprocess', () => {
    const a = inventoryPatchSchema.safeParse({ cellarId: 'none' });
    const b = inventoryPatchSchema.safeParse({ cellarId: '' });
    expect(a.success && a.data.cellarId).toBeNull();
    expect(b.success && b.data.cellarId).toBeNull();
  });

  it('coerces date-like strings for openedAt', () => {
    const res = inventoryPatchSchema.safeParse({ openedAt: '2026-08-30T10:00:00.000Z' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.openedAt).toBeInstanceOf(Date);
  });

  it('rejects fillLevel outside 0..100 and a future-year vintage', () => {
    expect(inventoryPatchSchema.safeParse({ fillLevel: 150 }).success).toBe(false);
    expect(inventoryPatchSchema.safeParse({ vintage: new Date().getFullYear() + 1 }).success).toBe(false);
  });

  it('requires expectedUpdatedAt to be an ISO datetime when present', () => {
    expect(inventoryPatchSchema.safeParse({ expectedUpdatedAt: '2026-08-01T09:00:00.000Z' }).success).toBe(true);
    expect(inventoryPatchSchema.safeParse({ expectedUpdatedAt: 'yesterday' }).success).toBe(false);
  });

  it('bounds cigar quantity and grid slot coordinates', () => {
    expect(inventoryPatchSchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(inventoryPatchSchema.safeParse({ slotColumn: 0 }).success).toBe(false);
    expect(inventoryPatchSchema.safeParse({ slotRow: 101 }).success).toBe(false);
  });
});

describe('guestInventoryUpdateSchema (FEAT-37, strict allow-list)', () => {
  it('accepts only consumption/service state fields', () => {
    expect(
      guestInventoryUpdateSchema.safeParse({ isOpened: true, fillLevel: 40, notes: 'ouverte au resto' }).success,
    ).toBe(true);
  });

  it('rejects any field outside the allow-list (defense in depth)', () => {
    expect(guestInventoryUpdateSchema.safeParse({ purchasePrice: 0 }).success).toBe(false);
    expect(guestInventoryUpdateSchema.safeParse({ isOpened: true, category: 'wine' }).success).toBe(false);
    expect(guestInventoryUpdateSchema.safeParse({ lockedFields: [] }).success).toBe(false);
  });
});

describe('rollbackFieldSchema', () => {
  it('requires a 1..100 char field name and passes toValue through untouched', () => {
    expect(rollbackFieldSchema.safeParse({ field: 'name', toValue: 'Old Name' }).success).toBe(true);
    expect(rollbackFieldSchema.safeParse({ field: 'name', toValue: null }).success).toBe(true);
    expect(rollbackFieldSchema.safeParse({ field: '', toValue: 1 }).success).toBe(false);
  });
});

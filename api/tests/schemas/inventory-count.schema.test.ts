import { describe, it, expect } from 'vitest';
import {
  startSessionSchema,
  scanSchema,
  correctionSchema,
  completeSessionSchema,
  recordFoundItemSchema,
} from '../../src/schemas/inventory-count.schema';

describe('startSessionSchema', () => {
  it('requires a 1..120 char scopeLabel', () => {
    expect(startSessionSchema.safeParse({ scopeLabel: 'Cave principale' }).success).toBe(true);
    expect(startSessionSchema.safeParse({ scopeLabel: '' }).success).toBe(false);
    expect(startSessionSchema.safeParse({ scopeLabel: 'x'.repeat(121) }).success).toBe(false);
  });

  it('accepts a null cellarId', () => {
    expect(startSessionSchema.safeParse({ scopeLabel: 'X', cellarId: null }).success).toBe(true);
  });
});

describe('scanSchema', () => {
  it('requires a non-empty itemId', () => {
    expect(scanSchema.safeParse({ itemId: 'abc' }).success).toBe(true);
    expect(scanSchema.safeParse({ itemId: '' }).success).toBe(false);
  });
});

describe('scanSchema — the number found of a group (#471, FEAT-100)', () => {
  it('accepts 0..1000 copies found, or none (the whole line)', () => {
    expect(scanSchema.parse({ itemId: 'g1', foundQuantity: 4 }).foundQuantity).toBe(4);
    expect(scanSchema.parse({ itemId: 'g1', foundQuantity: 0 }).foundQuantity).toBe(0);
    expect(scanSchema.parse({ itemId: 'g1' }).foundQuantity).toBeUndefined();
    expect(scanSchema.safeParse({ itemId: 'g1', foundQuantity: 1001 }).success).toBe(false);
    expect(scanSchema.safeParse({ itemId: 'g1', foundQuantity: 2.5 }).success).toBe(false);
    expect(scanSchema.safeParse({ itemId: 'g1', foundQuantity: -1 }).success).toBe(false);
  });
});

describe('correctionSchema — corrections of a group (#471, FEAT-100)', () => {
  it('accepts a number of copies on mark_consumed, correct_quantity and add_units', () => {
    expect(correctionSchema.safeParse({ action: 'mark_consumed', itemId: 'g1', count: 2 }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'correct_quantity', itemId: 'g1', reason: 'written_off' }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'correct_quantity', itemId: 'g1', reason: 'input_error', count: 2 }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'add_units', itemId: 'g1' }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'add_to_stock', entryId: 'f1', productId: 'p1' }).success).toBe(true);
  });

  it('requires a known reason to correct a number, and at least one copy', () => {
    expect(correctionSchema.safeParse({ action: 'correct_quantity', itemId: 'g1' }).success).toBe(false);
    expect(correctionSchema.safeParse({ action: 'correct_quantity', itemId: 'g1', reason: 'stolen' }).success).toBe(false);
    expect(correctionSchema.safeParse({ action: 'mark_consumed', itemId: 'g1', count: 0 }).success).toBe(false);
    expect(correctionSchema.safeParse({ action: 'add_units', itemId: 'g1', count: 1001 }).success).toBe(false);
  });
});

describe('correctionSchema (discriminated union on action)', () => {
  it('accepts each known action with its matching id field', () => {
    expect(correctionSchema.safeParse({ action: 'mark_consumed', itemId: 'i1' }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'move_to_scope', itemId: 'i1' }).success).toBe(true);
    expect(correctionSchema.safeParse({ action: 'add_to_stock', entryId: 'e1' }).success).toBe(true);
  });

  it('rejects add_to_stock carrying itemId instead of entryId', () => {
    expect(correctionSchema.safeParse({ action: 'add_to_stock', itemId: 'i1' }).success).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(correctionSchema.safeParse({ action: 'delete', itemId: 'i1' }).success).toBe(false);
  });
});

describe('completeSessionSchema', () => {
  it('defaults corrections to [] and caps them at 500', () => {
    expect(completeSessionSchema.parse({})).toEqual({ corrections: [] });
    const many = Array(501).fill({ action: 'mark_consumed', itemId: 'i1' });
    expect(completeSessionSchema.safeParse({ corrections: many }).success).toBe(false);
  });
});

describe('recordFoundItemSchema', () => {
  it('accepts a minimal find', () => {
    expect(recordFoundItemSchema.safeParse({ name: 'Mystery bottle', category: 'wine' }).success).toBe(true);
  });

  it('bounds an optional quantity to 1..1000', () => {
    expect(recordFoundItemSchema.safeParse({ name: 'X', category: 'cigar', quantity: 0 }).success).toBe(false);
    expect(recordFoundItemSchema.safeParse({ name: 'X', category: 'cigar', quantity: 1001 }).success).toBe(false);
  });
});

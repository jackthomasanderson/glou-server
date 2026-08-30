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

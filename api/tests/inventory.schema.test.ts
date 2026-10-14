import { describe, it, expect } from 'vitest';
import { inventoryInputSchema } from '../src/schemas/inventory.schema';

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

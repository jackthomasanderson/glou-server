import { describe, it, expect } from 'vitest';
import { WINE_COLORS } from '../../../shared/inventory';
import { maturityReferencePatchSchema, maturityReferenceSchema } from '../../src/schemas/maturity-reference.schema';

// #733: a reference colour is compared with the colour stored on a bottle
// (shared WINE_COLORS), so free text such as "Rouge" or "Red" never matched.
const base = { name: 'Reds', category: 'wine', mode: 'RELATIVE', windowFrom: 5, windowTo: 10 };

describe('maturity reference colour (#733)', () => {
  it.each(WINE_COLORS)('accepts the stored colour "%s"', (color) => {
    expect(maturityReferenceSchema.parse({ ...base, color }).color).toBe(color);
    expect(maturityReferencePatchSchema.parse({ color }).color).toBe(color);
  });

  it('accepts no colour', () => {
    expect(maturityReferenceSchema.parse({ ...base, color: null }).color).toBeNull();
    expect(maturityReferenceSchema.parse(base).color).toBeUndefined();
    expect(maturityReferencePatchSchema.parse({ color: null }).color).toBeNull();
  });

  it.each(['Rouge', 'Red', 'blanc', 'Rosé', 'rose', ''])('refuses the free text "%s"', (color) => {
    expect(maturityReferenceSchema.safeParse({ ...base, color }).success).toBe(false);
    expect(maturityReferencePatchSchema.safeParse({ color }).success).toBe(false);
  });
});

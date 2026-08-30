import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InventoryItem } from './types';
import { isDuplicateOf, findDuplicate, normalize, vintageMatch } from './duplicate';

const identityArb = fc.record({
  category: fc.constantFrom('wine' as const, 'sparkling' as const, 'spirit' as const, 'cigar' as const),
  name: fc.string({ minLength: 1 }),
  producer: fc.string({ minLength: 1 }),
  vintage: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: null }),
  bottleSize: fc.constantFrom('75cl', '150cl', 'Magnum', '70cl'),
  format: fc.constantFrom('Robusto', 'Churchill', 'Corona'),
});

const asItem = (i: object) => i as unknown as Partial<InventoryItem>;

describe('normalize / vintageMatch', () => {
  it('normalize is idempotent and case/whitespace-insensitive', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalize(normalize(s))).toBe(normalize(s));
        expect(normalize(s.toUpperCase())).toBe(normalize(s.toLowerCase()));
      }),
    );
  });

  it('vintageMatch is permissive when either side is missing', () => {
    fc.assert(
      fc.property(fc.option(fc.integer(), { nil: null }), (v) => {
        expect(vintageMatch(v, null)).toBe(true);
        expect(vintageMatch(null, v)).toBe(true);
      }),
    );
  });
});

describe('isDuplicateOf — properties', () => {
  it('is reflexive for a fully-identified item', () => {
    fc.assert(
      fc.property(identityArb, (i) => {
        expect(isDuplicateOf(asItem(i), asItem(i))).toBe(true);
      }),
    );
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(identityArb, identityArb, (a, b) => {
        expect(isDuplicateOf(asItem(a), asItem(b))).toBe(isDuplicateOf(asItem(b), asItem(a)));
      }),
    );
  });

  it('never considers two different categories a duplicate', () => {
    fc.assert(
      fc.property(identityArb, identityArb, (a, b) => {
        fc.pre(a.category !== b.category);
        expect(isDuplicateOf(asItem(a), asItem(b))).toBe(false);
      }),
    );
  });

  it('requires category, producer and name to all be present', () => {
    fc.assert(
      fc.property(identityArb, (i) => {
        expect(isDuplicateOf(asItem({ ...i, name: undefined as never }), asItem(i))).toBe(false);
        expect(isDuplicateOf(asItem({ ...i, producer: undefined as never }), asItem(i))).toBe(false);
      }),
    );
  });
});

describe('findDuplicate', () => {
  it('returns null for a candidate missing its identifying fields', () => {
    const items = [{ id: '1', category: 'wine', name: 'X', producer: 'Y' } as unknown as InventoryItem];
    expect(findDuplicate(items, { category: 'wine', name: 'X' })).toBeNull();
  });

  it('finds an existing entry that matches on the dedup rules', () => {
    const existing = {
      id: '1',
      category: 'wine',
      name: 'Pétrus',
      producer: 'Château Pétrus',
      vintage: 2015,
      bottleSize: '75cl',
    } as unknown as InventoryItem;
    const candidate = { category: 'wine' as const, name: 'pétrus', producer: 'château pétrus', vintage: 2015, bottleSize: '75CL' };
    expect(findDuplicate([existing], { ...candidate })).toBe(existing);
    expect(findDuplicate([existing], { ...candidate, name: 'Margaux' })).toBeNull();
  });
});

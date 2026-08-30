import { describe, it, expect } from 'vitest';
import { shareCreateSchema } from '../../src/schemas/shares.schema';

describe('shareCreateSchema', () => {
  it('applies sensible defaults on an empty object', () => {
    const res = shareCreateSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toMatchObject({
        hidePrices: false,
        hideNotes: false,
        cellarIds: [],
        collectionIds: [],
        writeCellarIds: [],
      });
    }
  });

  it('accepts a null / omitted expiresAt and a valid ISO datetime', () => {
    expect(shareCreateSchema.safeParse({ expiresAt: null }).success).toBe(true);
    expect(shareCreateSchema.safeParse({ expiresAt: '2026-12-31T23:59:59.000Z' }).success).toBe(true);
    expect(shareCreateSchema.safeParse({ expiresAt: '2026-12-31' }).success).toBe(false);
  });

  it('rejects writeCellarIds that are not a subset of cellarIds', () => {
    const res = shareCreateSchema.safeParse({
      cellarIds: ['a', 'b'],
      writeCellarIds: ['b', 'c'],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].path).toEqual(['writeCellarIds']);
    }
  });

  it('accepts writeCellarIds fully contained in cellarIds', () => {
    expect(
      shareCreateSchema.safeParse({ cellarIds: ['a', 'b'], writeCellarIds: ['a'] }).success,
    ).toBe(true);
  });

  it('caps label / inviteeName length at 100', () => {
    expect(shareCreateSchema.safeParse({ label: 'x'.repeat(101) }).success).toBe(false);
    expect(shareCreateSchema.safeParse({ inviteeName: 'x'.repeat(101) }).success).toBe(false);
  });
});

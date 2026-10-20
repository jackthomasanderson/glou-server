import { describe, it, expect } from 'vitest';
import { shareCreateSchema } from '../../src/schemas/shares.schema';

describe('shareCreateSchema', () => {
  it('applies sensible defaults given an explicit scope', () => {
    const res = shareCreateSchema.safeParse({ cellarIds: ['a'] });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toMatchObject({
        hidePrices: false,
        hideNotes: false,
        cellarIds: ['a'],
        collectionIds: [],
        writeCellarIds: [],
      });
      // ISSUE_046: an omitted expiresAt must no longer mean "forever".
      expect(res.data.expiresAt).not.toBeNull();
      expect(new Date(res.data.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    }
  });

  // ISSUE_046: cellarIds and collectionIds empty together used to mean "the
  // whole inventory" — the opposite of the intended default.
  it('rejects an empty object: no cellar or collection scope at all', () => {
    const res = shareCreateSchema.safeParse({});
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'cellarIds')).toBe(true);
    }
  });

  it('accepts a null expiresAt (explicit "no expiry") and a valid ISO datetime, given a scope', () => {
    expect(shareCreateSchema.safeParse({ cellarIds: ['a'], expiresAt: null }).success).toBe(true);
    expect(
      shareCreateSchema.safeParse({ cellarIds: ['a'], expiresAt: '2026-12-31T23:59:59.000Z' }).success,
    ).toBe(true);
    expect(shareCreateSchema.safeParse({ cellarIds: ['a'], expiresAt: '2026-12-31' }).success).toBe(false);
  });

  it('defaults expiresAt to roughly 30 days out when omitted', () => {
    const res = shareCreateSchema.safeParse({ cellarIds: ['a'] });
    expect(res.success).toBe(true);
    if (res.success) {
      const days = (new Date(res.data.expiresAt!).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(31);
    }
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

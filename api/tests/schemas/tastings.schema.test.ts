import { describe, it, expect } from 'vitest';
import { tastingCreateSchema, tastingPatchSchema } from '../../src/schemas/tastings.schema';

describe('tastingCreateSchema', () => {
  it('accepts an empty object (every field optional)', () => {
    expect(tastingCreateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a full structured wine tasting grid', () => {
    const res = tastingCreateSchema.safeParse({
      itemId: '11111111-1111-1111-1111-111111111111',
      tastedAt: '2026-08-30',
      context: 'Dîner',
      rating: 4,
      readiness: 'PEAK',
      notes: 'Belle longueur',
      foodPairing: 'Agneau',
      robe: 'Grenat profond',
      nez: 'Fruits noirs',
      bouche: 'Tanins soyeux',
      tanin: 3,
      acidite: 4,
      longueurBouche: 45,
    });
    expect(res.success).toBe(true);
  });

  it('rejects a non-uuid itemId', () => {
    expect(tastingCreateSchema.safeParse({ itemId: 'abc' }).success).toBe(false);
  });

  it('rejects a datetime string in the date-only tastedAt field', () => {
    expect(tastingCreateSchema.safeParse({ tastedAt: '2026-08-30T10:00:00Z' }).success).toBe(false);
  });

  it('clamps rating to the integer 1..5 range', () => {
    expect(tastingCreateSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(tastingCreateSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(tastingCreateSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });

  it('treats a cleared date field as no date (#704)', () => {
    const res = tastingCreateSchema.safeParse({ tastedAt: '' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.tastedAt).toBeUndefined();
    expect(tastingPatchSchema.safeParse({ tastedAt: '' }).success).toBe(true);
  });

  // #704: the tasting form sends `rating: null` when no star is picked.
  it('accepts a tasting with no rating (null)', () => {
    expect(tastingCreateSchema.safeParse({ rating: null }).success).toBe(true);
  });

  it('rejects an unknown readiness value but accepts null', () => {
    expect(tastingCreateSchema.safeParse({ readiness: 'MATURE' }).success).toBe(false);
    expect(tastingCreateSchema.safeParse({ readiness: null }).success).toBe(true);
  });

  it('bounds longueurBouche to 0..600', () => {
    expect(tastingCreateSchema.safeParse({ longueurBouche: -1 }).success).toBe(false);
    expect(tastingCreateSchema.safeParse({ longueurBouche: 601 }).success).toBe(false);
  });

  it('rejects a non-url photoUrl', () => {
    expect(tastingCreateSchema.safeParse({ photoUrl: 'not a url' }).success).toBe(false);
  });
});

describe('tastingPatchSchema', () => {
  it('is a partial of the create schema', () => {
    expect(tastingPatchSchema.safeParse({}).success).toBe(true);
    expect(tastingPatchSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(tastingPatchSchema.safeParse({ rating: 9 }).success).toBe(false);
  });

  // #704: removing the stars of a rated tasting sends `rating: null`.
  it('clears a rating with null', () => {
    expect(tastingPatchSchema.safeParse({ rating: null }).success).toBe(true);
  });
});

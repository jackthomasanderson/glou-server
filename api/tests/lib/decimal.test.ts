import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toNumber } from '../../src/lib/decimal';

describe('toNumber', () => {
  it('converts a Prisma.Decimal to a plain number', () => {
    expect(toNumber(new Prisma.Decimal('42.50'))).toBe(42.5);
  });

  it('passes a plain number through unchanged (test-mocked aggregates)', () => {
    expect(toNumber(250)).toBe(250);
  });

  it('returns null for null and undefined', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

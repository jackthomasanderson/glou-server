import { describe, it, expect } from 'vitest';
import { inventoryFormSchema } from './types';

describe('inventoryFormSchema (client-side pre-submit validation)', () => {
  const minimal = { category: 'wine' as const, name: 'Pétrus', producer: 'Château Pétrus' };

  it('accepts a minimal wine and fills defaults', () => {
    const res = inventoryFormSchema.safeParse(minimal);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.tags).toEqual([]);
      expect(res.data.isOpened).toBe(false);
      expect(res.data.alertStatus).toBe('none');
    }
  });

  it('requires name and producer', () => {
    expect(inventoryFormSchema.safeParse({ ...minimal, name: '' }).success).toBe(false);
    expect(inventoryFormSchema.safeParse({ ...minimal, producer: '' }).success).toBe(false);
  });

  it('accepts an empty-string photoUrl but rejects a malformed one', () => {
    expect(inventoryFormSchema.safeParse({ ...minimal, photoUrl: '' }).success).toBe(true);
    expect(inventoryFormSchema.safeParse({ ...minimal, photoUrl: 'https://x.test/p.jpg' }).success).toBe(true);
    expect(inventoryFormSchema.safeParse({ ...minimal, photoUrl: 'nope' }).success).toBe(false);
  });

  it('bounds vintage, fillLevel, quantity and alcoholDegree', () => {
    expect(inventoryFormSchema.safeParse({ ...minimal, vintage: 1799 }).success).toBe(false);
    expect(inventoryFormSchema.safeParse({ ...minimal, vintage: new Date().getFullYear() + 1 }).success).toBe(false);
    expect(inventoryFormSchema.safeParse({ ...minimal, fillLevel: 101 }).success).toBe(false);
    expect(inventoryFormSchema.safeParse({ ...minimal, quantity: 0 }).success).toBe(false);
    expect(inventoryFormSchema.safeParse({ ...minimal, alcoholDegree: 100.1 }).success).toBe(false);
  });

  it('rejects more than 20 tags', () => {
    expect(inventoryFormSchema.safeParse({ ...minimal, tags: Array(21).fill('x') }).success).toBe(false);
  });
});

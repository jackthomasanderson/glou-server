import { describe, expect, it } from 'vitest';
import { productsFromFlatItems } from '../fromFlat';
import { isGone, stockSummaryOf } from '../filters';
import type { InventoryItem } from '@/lib/inventory/types';

// FEAT-16/23 offline fallback: the wines rebuilt from the mirrored flat bottles.

const flat = (over: Partial<InventoryItem> & { id: string }): InventoryItem => ({
  userId: 'u', category: 'wine', name: 'Cuvée X', producer: 'Domaine', tags: [], grapeVarieties: [],
  lockedFields: [], isOpened: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('productsFromFlatItems', () => {
  it('groups the bottles of a wine on one card, counting what is in stock', () => {
    const products = productsFromFlatItems([
      flat({ id: 'a', productId: 'p1', quantity: 4, cellarId: 'garage' }),
      flat({ id: 'b', productId: 'p1', isOpened: true, fillLevel: 60 }),
      flat({ id: 'c', productId: 'p1', isOpened: true, fillLevel: 0 }),
      flat({ id: 'd', productId: 'p2', name: 'Autre', isOpened: true, fillLevel: 0 }),
      flat({ id: 'e', productId: 'p3', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(products.map((p) => p.id)).toEqual(['p1', 'p2']);
    const [cuvee, other] = products;
    expect(cuvee.name).toBe('Cuvée X');
    expect(cuvee.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(cuvee.items[0]).not.toHaveProperty('name');
    expect(stockSummaryOf(cuvee).units).toBe(5);
    // Only finished bottles left: "Plus en cave".
    expect(isGone(other)).toBe(true);
  });
});

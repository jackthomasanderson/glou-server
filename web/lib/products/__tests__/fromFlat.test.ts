import { describe, expect, it } from 'vitest';
import { detailWithUnitWrite, familyIdOf, productsFromFlatItems, withFlatItem, withoutUnit } from '../fromFlat';
import { isGone, stockSummaryOf } from '../filters';
import type { InventoryItem } from '@/lib/inventory/types';
import { unit } from './factories';

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

describe('withFlatItem / withoutUnit (ISSUE_381: the card updated in place)', () => {
  const [wine] = productsFromFlatItems([
    flat({ id: 'a', productId: 'p1', quantity: 4 }),
    flat({ id: 'b', productId: 'p1', isOpened: true, fillLevel: 60 }),
  ]);

  it('a bottle saved changes its line and the description it carries', () => {
    const [next] = withFlatItem([wine], flat({ id: 'b', productId: 'p1', name: 'Cuvée Y', isOpened: true, fillLevel: 30 }))!;
    expect(next.name).toBe('Cuvée Y');
    expect(next.items.map((u) => [u.id, u.fillLevel])).toEqual([['a', null], ['b', 30]]);
  });

  it('a bottle finished leaves the card, and dates its last activity', () => {
    const [next] = withFlatItem([wine], flat({ id: 'b', productId: 'p1', isOpened: true, fillLevel: 0, updatedAt: '2026-10-30T10:00:00.000Z' }))!;
    expect(next.items.map((u) => u.id)).toEqual(['a']);
    expect(next.lastActivityAt).toBe('2026-10-30T10:00:00.000Z');
  });

  it('a bottle trashed leaves the card; other wines are untouched', () => {
    const other = { ...wine, id: 'p2', items: [] };
    const next = withoutUnit([wine, other], 'a')!;
    expect(next[0].items.map((u) => u.id)).toEqual(['b']);
    expect(next[1]).toBe(other);
  });
});

// D8 on the open drawer: the level of an opened bottle set from its line.
describe('detailWithUnitWrite', () => {
  const detail = { items: [unit({ id: 'group', quantity: 5 }), unit({ id: 'sub', isOpened: true, fillLevel: 60, parentItemId: 'group' })] };

  it('replaces the bottle written, keeping it once finished', () => {
    const next = detailWithUnitWrite(detail, flat({ id: 'sub', productId: 'p1', isOpened: true, fillLevel: 0 }));
    expect(next?.items.map((i) => [i.id, i.fillLevel])).toEqual([['group', null], ['sub', 0]]);
    expect(next?.items[1]).not.toHaveProperty('name');
  });

  it('a bottle put back full: absorbed by its group (removedIds), the group answered as data', () => {
    const next = detailWithUnitWrite(detail, flat({ id: 'group', productId: 'p1', quantity: 6 }), [], ['sub']);
    expect(next?.items.map((i) => [i.id, i.quantity])).toEqual([['group', 6]]);
  });

  it('nothing cached: nothing to change', () => {
    expect(detailWithUnitWrite(undefined, null)).toBeUndefined();
  });
});

// QR codes and notifications open the wine, from any of its bottles.
describe('familyIdOf', () => {
  const [wine] = productsFromFlatItems([flat({ id: 'a', productId: 'p1', quantity: 4 })]);
  const drunk = flat({ id: 'old', productId: 'p1', isOpened: true, fillLevel: 0 });

  it('a wine id, or a bottle in stock, opens the wine', () => {
    expect(familyIdOf('p1', [wine], [])).toBe('p1');
    expect(familyIdOf('a', [wine], [])).toBe('p1');
  });

  it('a bottle already drunk opens its wine too', () => {
    expect(familyIdOf('old', [wine], [drunk])).toBe('p1');
  });

  it('unknown everywhere: nothing (the caller asks the server)', () => {
    expect(familyIdOf('nope', [wine], [drunk])).toBeUndefined();
  });
});

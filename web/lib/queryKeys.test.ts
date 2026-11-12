import { describe, it, expect } from 'vitest';
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { invalidateAfterInventoryChange } from './queryKeys';

// #621: the one list of what a stock change refreshes.

const derived: QueryKey[] = [
  ['inventory', 'product', 'p1'], // a wine's drawer, its history
  ['inventory', 'products-trash'],
  ['inventory', 'trash'],
  ['inventory', 'review'], // "À regrouper ?"
  ['cellars'],
  ['cellars', 'c1', 'grid'],
  ['stats', 'counts'], // sidebar badges
  ['alerts'], // the bell
  ['consumption-plan', 'goal'],
  ['consumption-plan', 'suggestions', 7],
  ['analytics', undefined, undefined],
  ['budget', 'envelopes'],
  ['collections'],
  ['inventory-count', 'active'],
];
const lists: QueryKey[] = [['inventory'], ['inventory', 'products']];
const unrelated: QueryKey[] = [['tastings'], ['wishlist'], ['auth', 'me'], ['shares']];

function seeded() {
  const qc = new QueryClient();
  for (const key of [...derived, ...lists, ...unrelated]) qc.setQueryData(key, []);
  return qc;
}
const invalidated = (qc: QueryClient, key: QueryKey) => qc.getQueryState(key)?.isInvalidated;

describe('invalidateAfterInventoryChange (#621)', () => {
  it('marks stale everything derived from the stock, and nothing else', () => {
    const qc = seeded();
    invalidateAfterInventoryChange(qc);
    for (const key of [...derived, ...lists]) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true);
    for (const key of unrelated) expect(invalidated(qc, key), JSON.stringify(key)).toBe(false);
  });

  it('leaves alone the lists the caller already wrote from the answer (#462)', () => {
    const qc = seeded();
    invalidateAfterInventoryChange(qc, { alreadyWritten: lists });
    for (const key of lists) expect(invalidated(qc, key), JSON.stringify(key)).toBe(false);
    for (const key of derived) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true);
  });
});

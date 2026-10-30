import { describe, it, expect } from 'vitest';
import { newestCopy } from './newestCopy';
import type { InventoryItem } from './types';

const bottle = (over: Partial<InventoryItem>) =>
  ({ id: 'A', name: 'Pétrus', updatedAt: '2026-10-01T10:00:00.000Z', ...over }) as InventoryItem;

describe('newestCopy (#572)', () => {
  it('takes the cached copy changed after the one handed over', () => {
    const stale = bottle({ fillLevel: 100 });
    const fresh = bottle({ fillLevel: 50, updatedAt: '2026-10-01T10:05:00.000Z' });
    expect(newestCopy(stale, undefined, fresh)).toBe(fresh);
  });

  it('keeps the copy handed over when the caches are older', () => {
    const given = bottle({ updatedAt: '2026-10-01T10:05:00.000Z' });
    expect(newestCopy(given, bottle({}))).toBe(given);
  });

  it('prefers a cached copy on a tie (an offline change keeps its old version)', () => {
    const queued = bottle({ fillLevel: 50 });
    expect(newestCopy(bottle({ fillLevel: 100 }), queued)).toBe(queued);
  });

  it('ignores a copy of another bottle', () => {
    const given = bottle({});
    expect(newestCopy(given, bottle({ id: 'B', updatedAt: '2027-01-01T00:00:00.000Z' }))).toBe(given);
  });

  it('keeps the collections a save answer lacks', () => {
    const collections = [{ id: 'c1', name: 'Garde', color: 'red' }] as InventoryItem['collections'];
    const saved = bottle({ fillLevel: 50, updatedAt: '2026-10-01T10:05:00.000Z' });
    expect(newestCopy(bottle({ collections }), saved)).toEqual({ ...saved, collections });
  });
});

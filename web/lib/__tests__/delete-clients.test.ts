import { describe, it, expect, vi, afterEach } from 'vitest';
import { budgetClient } from '../budget/client';
import { bulkPresetClient } from '../bulk-presets/client';
import { collectionsClient } from '../collections/client';
import { tastingsClient } from '../tastings/client';
import { wishlistClient } from '../wishlist/client';

// #580: the API answers 204 No Content to these deletes. Four clients each
// hand-copied a fetch to cope with it (losing the API's error code and the
// timeout), one did not and failed on every successful delete, and removing a
// bottle from a collection read an error answer as a success.

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function apiError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

const deletes = [
  { name: 'budget envelope', remove: () => budgetClient.delete('b1'), url: '/api/wishlist/budget-envelopes/b1' },
  { name: 'bulk-action preset', remove: () => bulkPresetClient.delete('p1'), url: '/api/bulk-presets/p1' },
  { name: 'collection', remove: () => collectionsClient.delete('c1'), url: '/api/collections/c1' },
  { name: 'tasting', remove: () => tastingsClient.delete('t1'), url: '/api/tastings/t1' },
  { name: 'wishlist item', remove: () => wishlistClient.delete('w1'), url: '/api/wishlist/items/w1' },
];

describe.each(deletes)('deleting a $name', ({ remove, url }) => {
  it('succeeds on 204 No Content', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(remove()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'DELETE', credentials: 'include' }));
  });

  it('passes on the API error code', async () => {
    stubFetch(apiError(404, 'NOT_FOUND'));
    await expect(remove()).rejects.toThrow('NOT_FOUND');
  });
});

describe('removing a bottle from a collection', () => {
  it('returns the updated collection', async () => {
    const collection = { id: 'c1', name: 'Garde', color: '#800020', userId: 'u1', items: [], createdAt: '', updatedAt: '' };
    stubFetch(new Response(JSON.stringify({ data: collection }), { status: 200 }));
    await expect(collectionsClient.removeItem('c1', 'i1')).resolves.toEqual(collection);
  });

  it('reports a server error as an error', async () => {
    stubFetch(apiError(404, 'COLLECTION_NOT_FOUND'));
    await expect(collectionsClient.removeItem('c1', 'i1')).rejects.toThrow('COLLECTION_NOT_FOUND');
  });
});

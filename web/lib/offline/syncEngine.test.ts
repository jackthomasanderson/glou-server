import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { QueuedMutation } from './db';

// ─── In-memory stand-in for the IndexedDB layer ────────────────────────────
// vi.hoisted: the vi.mock factory below is hoisted above normal top-level
// code, so the maps it closes over must be hoisted too.
const { store, cachedItems } = vi.hoisted(() => ({
  store: new Map<string, QueuedMutation>(),
  cachedItems: new Map<string, unknown>(),
}));

vi.mock('./db', () => ({
  getAllQueuedMutations: vi.fn(async () =>
    [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ),
  putQueuedMutation: vi.fn(async (m: QueuedMutation) => {
    store.set(m.id, m);
  }),
  deleteQueuedMutation: vi.fn(async (id: string) => {
    store.delete(id);
  }),
  getQueuedMutation: vi.fn(async (id: string) => store.get(id)),
  patchCachedItem: vi.fn(async () => {}),
  putCachedItem: vi.fn(async (item: { id: string }) => {
    cachedItems.set(item.id, item);
  }),
}));

import { flushQueue } from './syncEngine';

function fakeQueryClient() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
  } as unknown as import('@tanstack/react-query').QueryClient;
}

function queue(partial: Partial<QueuedMutation> & { id: string; itemId: string; createdAt: string }): void {
  store.set(partial.id, {
    patch: { isOpened: true },
    expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    ...partial,
  });
}

const okResponse = (item: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ data: item }) }) as Response;
const errResponse = (status: number, body: unknown = {}) =>
  ({ ok: false, status, json: async () => body }) as Response;

beforeEach(() => {
  store.clear();
  cachedItems.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('flushQueue — FIFO replay', () => {
  it('replays independent items in emission order and clears them on success', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: '2026-01-01T00:00:01.000Z' });
    queue({ id: 'm2', itemId: 'B', createdAt: '2026-01-01T00:00:02.000Z' });

    const seen: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      seen.push(url);
      const id = url.split('/').pop()!;
      return okResponse({ id, updatedAt: 'x' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    expect(seen).toEqual(['/api/inventory/A', '/api/inventory/B']);
    expect(store.size).toBe(0);
  });

  it('sends the queued patch plus the expectedUpdatedAt guard', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 40 }, expectedUpdatedAt: 'ts-1' });
    const fetchMock = vi.fn(async () => okResponse({ id: 'A', updatedAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ fillLevel: 40, expectedUpdatedAt: 'ts-1' });
  });
});

describe('flushQueue — failure isolation', () => {
  it('a failed mutation blocks only later mutations for the SAME item', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'a2', itemId: 'A', createdAt: 't2' });
    queue({ id: 'b1', itemId: 'B', createdAt: 't3' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/A')) return errResponse(500, { error: 'BOOM' });
      return okResponse({ id: 'B', updatedAt: 'x' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    // A tried once, then a2 skipped; B still flushed
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.get('a1')?.status).toBe('failed');
    expect(store.get('a2')?.status).toBe('pending');
    expect(store.has('b1')).toBe(false);
  });

  it('a 409 marks the mutation as a conflict carrying the server item', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'a2', itemId: 'A', createdAt: 't2' });

    const serverItem = { id: 'A', updatedAt: '2026-02-02T00:00:00.000Z', isOpened: false };
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(409, { data: serverItem })));

    await flushQueue(fakeQueryClient());

    expect(store.get('a1')?.status).toBe('conflict');
    expect(store.get('a1')?.conflictServerItem).toEqual(serverItem);
    expect(store.get('a2')?.status).toBe('pending');
  });

  it('is re-entrancy safe — a second call while flushing is a no-op', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1' });

    // A single gate promise, its resolver captured synchronously up front so
    // the timing of when we release it doesn't matter.
    let releaseFetch!: (r: Response) => void;
    const gate = new Promise<Response>((res) => { releaseFetch = res; });
    const fetchMock = vi.fn(() => gate);
    vi.stubGlobal('fetch', fetchMock);

    const qc = fakeQueryClient();
    const first = flushQueue(qc);
    const second = flushQueue(qc); // bails immediately on the isFlushing guard

    releaseFetch(okResponse({ id: 'A', updatedAt: 'x' }));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

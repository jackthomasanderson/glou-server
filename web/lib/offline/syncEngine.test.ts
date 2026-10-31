import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { QueuedMutation } from './db';

// ─── In-memory stand-in for the IndexedDB layer ────────────────────────────
// vi.hoisted: the vi.mock factory below is hoisted above normal top-level
// code, so the maps it closes over must be hoisted too.
const { store, cachedItems, hooks } = vi.hoisted(() => ({
  store: new Map<string, QueuedMutation>(),
  cachedItems: new Map<string, unknown>(),
  hooks: {} as { onPut?: (m: QueuedMutation) => void },
}));

vi.mock('./db', () => ({
  getAllQueuedMutations: vi.fn(async () =>
    [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ),
  putQueuedMutation: vi.fn(async (m: QueuedMutation) => {
    store.set(m.id, m);
    hooks.onPut?.(m);
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

import {
  flushQueue, cancelSyncRetry, deferConflict, undeferConflict, getDeferredConflictIds,
  overlayQueuedChanges, MAX_TEMPORARY_FAILURES,
} from './syncEngine';
import type { InventoryItem } from '@/lib/inventory/types';

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
  cancelSyncRetry();
  window.sessionStorage.clear();
  hooks.onPut = undefined;
});
afterEach(() => {
  cancelSyncRetry();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Fake API holding one item's version: refuses a stale `expectedUpdatedAt`
 * like api/src/services/inventory.service.ts::updateItem, and moves the
 * version forward on each accepted change. */
function versionedServer(initial: string) {
  let version = initial;
  /** Another device changes the item. */
  const bump = (next: string) => { version = next; };
  let counter = 0;
  const received: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    received.push(body);
    const id = url.split('/').pop();
    if (body.expectedUpdatedAt !== version) {
      return errResponse(409, { data: { id, updatedAt: version } });
    }
    counter += 1;
    version = `v-${counter + 1}`;
    return okResponse({ id, updatedAt: version, ...body });
  });
  return { fetchMock, received, version: () => version, bump };
}

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

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init?.body ?? ''));
    expect(body).toEqual({ fillLevel: 40, expectedUpdatedAt: 'ts-1' });
  });
});

describe('flushQueue — failure isolation', () => {
  it('a failed mutation blocks only later mutations for the SAME item', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'a2', itemId: 'A', createdAt: 't2' });
    queue({ id: 'b1', itemId: 'B', createdAt: 't3' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/A')) return errResponse(400, { error: 'VALIDATION_ERROR' });
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

  it('resets a stale "syncing" mutation (left over from an interrupted previous flush) back to pending and retries it (#168)', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', status: 'syncing' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', status: 'pending' });

    const fetchMock = vi.fn(async (url: string) => okResponse({ id: url.split('/').pop(), updatedAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    // Both A mutations went through — m1 was never permanently stuck, and it
    // didn't block m2 behind it either.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.has('m1')).toBe(false);
    expect(store.has('m2')).toBe(false);
  });
});

describe('flushQueue — several changes to the same item (#585)', () => {
  it('two successful mutations of the same item sync without a conflict', async () => {
    // Opened at 50 %, then finished, both offline from version v-1.
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { isOpened: true, fillLevel: 50 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', patch: { fillLevel: 0 }, expectedUpdatedAt: 'v-1' });
    const server = versionedServer('v-1');
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(fakeQueryClient());

    expect(store.size).toBe(0);
    expect(server.received.map((b) => b.expectedUpdatedAt)).toEqual(['v-1', 'v-2']);
    expect(cachedItems.get('A')).toMatchObject({ fillLevel: 0, updatedAt: 'v-3' });
  });

  it('keeps two "drink one" on the same item as two separate requests, never merged', async () => {
    queue({ id: 'd1', itemId: 'G', createdAt: 't1', patch: { drink: 1 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'd2', itemId: 'G', createdAt: 't2', patch: { drink: 1 }, expectedUpdatedAt: 'v-1' });
    const server = versionedServer('v-1');
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(fakeQueryClient());

    expect(server.fetchMock).toHaveBeenCalledTimes(2);
    expect(server.received).toEqual([
      { drink: 1, expectedUpdatedAt: 'v-1' },
      { drink: 1, expectedUpdatedAt: 'v-2' },
    ]);
  });

  it('keeps the new expected version of a later change that has to wait for another attempt', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 50 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', patch: { fillLevel: 0 }, expectedUpdatedAt: 'v-1' });
    const server = versionedServer('v-1');
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 2) return errResponse(503);
      return server.fetchMock(url, init);
    }));

    await flushQueue(fakeQueryClient());
    expect(store.get('m2')).toMatchObject({ status: 'pending', expectedUpdatedAt: 'v-2' });

    await flushQueue(fakeQueryClient());
    expect(store.size).toBe(0);
  });

  it('shows the still-queued changes on top of the server answer', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 50 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', patch: { fillLevel: 0 }, expectedUpdatedAt: 'v-1' });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? okResponse({ id: 'A', updatedAt: 'v-2', fillLevel: 50 }) : errResponse(503);
    }));

    await flushQueue(fakeQueryClient());

    expect(cachedItems.get('A')).toMatchObject({ fillLevel: 0, updatedAt: 'v-2' });
  });
});

describe('flushQueue — temporary server errors (#585)', () => {
  it.each([500, 502, 503, 429, 401, 408])('a %i leaves the change pending, without blocking it', async (status) => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(status, { error: 'SERVER_UNAVAILABLE' })));

    await flushQueue(fakeQueryClient());

    expect(store.get('a1')?.status).toBe('pending');
    expect(store.get('a1')?.errorReason).toBeUndefined();
  });

  it('a network failure leaves the change pending', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await flushQueue(fakeQueryClient());

    expect(store.get('a1')?.status).toBe('pending');
  });

  it('stops the replay on a temporary error: the server is unavailable for every item', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'b1', itemId: 'B', createdAt: 't2' });
    const fetchMock = vi.fn(async () => errResponse(503));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.get('b1')?.status).toBe('pending');
  });

  it('5xx → stays pending, then goes through on the next attempt without user action', async () => {
    vi.useFakeTimers();
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    let serverUp = false;
    const fetchMock = vi.fn(async () => (serverUp ? okResponse({ id: 'A', updatedAt: 'x' }) : errResponse(500)));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());
    expect(store.get('a1')?.status).toBe('pending');

    serverUp = true;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.has('a1')).toBe(false);
  });

  it('a real refusal (400) still marks the change failed, with its reason', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(400, { error: 'VALIDATION_ERROR' })));

    await flushQueue(fakeQueryClient());

    expect(store.get('a1')).toMatchObject({ status: 'failed', errorReason: 'VALIDATION_ERROR' });
  });
});

describe('"Decide later" on a conflict (#585)', () => {
  it('is remembered for the browser session, outside any component', () => {
    deferConflict('c1');
    deferConflict('c1');
    deferConflict('c2');
    expect(getDeferredConflictIds()).toEqual(['c1', 'c2']);
    expect(JSON.parse(window.sessionStorage.getItem('glou.offline.deferredConflicts') ?? '[]')).toEqual(['c1', 'c2']);
  });
});

describe('flushQueue — review follow-ups (#585)', () => {
  it('a real conflict (another device between two replays) is still detected after the version carry-over', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 50 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', patch: { fillLevel: 0 }, expectedUpdatedAt: 'v-1' });
    const server = versionedServer('v-1');
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 2) return errResponse(503);
      return server.fetchMock(url, init);
    }));

    await flushQueue(fakeQueryClient());
    expect(store.get('m2')?.expectedUpdatedAt).toBe('v-2');

    // While the server was unavailable, another member changed the bottle.
    server.bump('v-other');
    await flushQueue(fakeQueryClient());

    expect(store.get('m2')?.status).toBe('conflict');
    expect(store.get('m2')?.conflictServerItem).toMatchObject({ updatedAt: 'v-other' });
  });

  it(`marks a change failed, with the reason, after ${MAX_TEMPORARY_FAILURES} "try again later" answers, and lets the rest of the queue go`, async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1', temporaryFailures: MAX_TEMPORARY_FAILURES - 1 });
    queue({ id: 'b1', itemId: 'B', createdAt: 't2' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/A') ? errResponse(503, { error: 'SERVICE_UNAVAILABLE' }) : okResponse({ id: 'B', updatedAt: 'x' }),
    ));

    await flushQueue(fakeQueryClient());

    expect(store.get('a1')).toMatchObject({ status: 'failed', errorReason: 'SERVICE_UNAVAILABLE' });
    expect(store.has('b1')).toBe(false);
  });

  it('counts each "try again later" answer, but not a request that got no answer (offline)', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(500)));
    await flushQueue(fakeQueryClient());
    expect(store.get('a1')?.temporaryFailures).toBe(1);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await flushQueue(fakeQueryClient());
    expect(store.get('a1')).toMatchObject({ status: 'pending', temporaryFailures: 1 });
  });

  it('treats a session waiting for its second factor (403 2FA_REQUIRED) as temporary', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'b1', itemId: 'B', createdAt: 't2' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(403, { error: '2FA_REQUIRED' })));
    await flushQueue(fakeQueryClient());
    expect(store.get('a1')?.status).toBe('pending');

    store.clear();
    queue({ id: 'c1', itemId: 'C', createdAt: 't3' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(403, { error: 'FORBIDDEN' })));
    await flushQueue(fakeQueryClient());
    expect(store.get('c1')?.status).toBe('failed');
  });

  it('never counts an expired session (401) or a pending second factor, so the change waits as long as needed', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1', temporaryFailures: MAX_TEMPORARY_FAILURES - 1 });
    for (const answer of [
      () => errResponse(401, { error: 'TOKEN_INVALID_OR_EXPIRED' }),
      () => errResponse(403, { error: '2FA_REQUIRED' }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => answer()));
      for (let i = 0; i < MAX_TEMPORARY_FAILURES + 2; i += 1) await flushQueue(fakeQueryClient());
      expect(store.get('a1')).toMatchObject({ status: 'pending', temporaryFailures: MAX_TEMPORARY_FAILURES - 1 });
    }
  });

  it('does not count a flush that got no answer (e.g. the one run when the page mounts while offline)', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1', temporaryFailures: MAX_TEMPORARY_FAILURES - 1 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    for (let i = 0; i < MAX_TEMPORARY_FAILURES + 2; i += 1) await flushQueue(fakeQueryClient());
    expect(store.get('a1')).toMatchObject({ status: 'pending', temporaryFailures: MAX_TEMPORARY_FAILURES - 1 });
  });

  it('does not refetch the list when nothing reached the server', async () => {
    queue({ id: 'a1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(503)));
    const qc = fakeQueryClient();

    await flushQueue(qc);

    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });

  it('refetches after a success, and the refetched list keeps the change still queued on screen', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 50 }, expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', patch: { fillLevel: 0 }, expectedUpdatedAt: 'v-1' });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? okResponse({ id: 'A', updatedAt: 'v-2', fillLevel: 50 }) : errResponse(429);
    }));
    const qc = fakeQueryClient();

    await flushQueue(qc);

    expect(qc.invalidateQueries).toHaveBeenCalled();
    const refetched = [{ id: 'A', updatedAt: 'v-2', fillLevel: 50 } as InventoryItem];
    expect(await overlayQueuedChanges(refetched)).toEqual([{ id: 'A', updatedAt: 'v-2', fillLevel: 0 }]);
  });

  it('leaves a change in conflict out of the overlay', async () => {
    queue({ id: 'c1', itemId: 'A', createdAt: 't1', patch: { fillLevel: 0 }, status: 'conflict' });
    const items = [{ id: 'A', fillLevel: 50 } as InventoryItem];
    expect(await overlayQueuedChanges(items)).toEqual(items);
  });

  it('does not bring back a later change discarded while the version was being carried over', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1', expectedUpdatedAt: 'v-1' });
    queue({ id: 'm2', itemId: 'A', createdAt: 't2', expectedUpdatedAt: 'v-1' });
    queue({ id: 'm3', itemId: 'A', createdAt: 't3', expectedUpdatedAt: 'v-1' });
    let firstCall = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!firstCall) return errResponse(503);
      firstCall = false;
      // The member discards m3 as soon as m2 gets its new version.
      hooks.onPut = (m) => { if (m.id === 'm2' && m.expectedUpdatedAt === 'v-2') store.delete('m3'); };
      return okResponse({ id: 'A', updatedAt: 'v-2' });
    }));

    await flushQueue(fakeQueryClient());

    expect(store.has('m3')).toBe(false);
    expect(store.get('m2')?.expectedUpdatedAt).toBe('v-2');
  });

  it('"Resolve" brings a postponed conflict back', () => {
    deferConflict('c1');
    deferConflict('c2');
    undeferConflict('c1');
    expect(getDeferredConflictIds()).toEqual(['c2']);
  });
});

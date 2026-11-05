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
  // One step each, like the IndexedDB transactions they stand for.
  claimQueuedMutation: vi.fn(async (id: string) => {
    const found = store.get(id);
    if (!found || found.status !== 'pending') return undefined;
    const claimed = { ...found, status: 'syncing' as const };
    store.set(id, claimed);
    return claimed;
  }),
  takeQueuedMutationUnlessSyncing: vi.fn(async (id: string) => {
    const found = store.get(id);
    if (!found || found.status === 'syncing') return undefined;
    store.delete(id);
    return found;
  }),
  rewriteCachedItems: vi.fn(async (change: (items: Array<{ id: string }>) => Array<{ id: string }>) => {
    const after = change([...cachedItems.values()] as Array<{ id: string }>);
    cachedItems.clear();
    for (const item of after) cachedItems.set(item.id, item);
  }),
}));

import { QueryClient } from '@tanstack/react-query';
import {
  flushQueue, cancelSyncRetry, deferConflict, undeferConflict, getDeferredConflictIds,
  overlayQueuedChanges, MAX_TEMPORARY_FAILURES, enqueueMutation, discardQueuedMutation,
  resolveConflictKeepLocal, SYNC_LOCK_NAME, removeQueuedMutation,
} from './syncEngine';
import { provisionalIdOf } from './optimistic';
import { refusalKey } from './describe';
import type { InventoryItem } from '@/lib/inventory/types';

function fakeQueryClient() {
  return {
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
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

// ─── FEAT-108 — open, drink, correct one copy of a group offline ────────────

/** Fake API holding one group ×N: a state detaches one copy (D8), a
 * correction sets its number; both refuse a stale version (409 with the
 * group), like stock-state.service.ts and stock.service.ts. */
function groupServer(quantity: number) {
  let group = { id: 'g', productId: 'p1', quantity, isOpened: false, fillLevel: 100, cigarsLeft: null, updatedAt: 'g-1' };
  let version = 1;
  const received: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  /** Lets the request reach the server, then cuts the answer (the network dropped meanwhile). */
  let loseNextAnswer = false;
  const subs: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET' && url === '/api/products/p1') {
      return { ok: true, status: 200, json: async () => ({ data: { id: 'p1', items: [group, ...subs] } }) } as Response;
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    received.push({ url, method: init?.method ?? 'GET', body });
    if (body.expectedUpdatedAt !== group.updatedAt) return errResponse(409, { error: 'CONFLICT', data: group });
    version += 1;
    let answer: unknown;
    if (url.endsWith('/correct')) {
      const gone = group.quantity - Number(body.quantity);
      group = { ...group, quantity: Number(body.quantity), updatedAt: `g-${version}` };
      answer = { data: { id: `w-${version}`, productId: 'p1', quantity: gone, writtenOffAt: 'now', updatedAt: `w-${version}` }, changed: [group], removedIds: [] };
    } else {
      group = { ...group, quantity: group.quantity - 1, updatedAt: `g-${version}` };
      const sub = {
        id: `s-${version}`, productId: 'p1', quantity: 1, isOpened: true, fillLevel: body.fillLevel,
        openedAt: body.openedAt ?? null, parentItemId: 'g', deletedAt: null, updatedAt: `s-${version}`,
      };
      subs.push(sub);
      answer = { data: sub, changed: [group], removedIds: [] };
    }
    if (loseNextAnswer) {
      loseNextAnswer = false;
      throw new TypeError('Failed to fetch');
    }
    return { ok: true, status: 200, json: async () => answer } as Response;
  });
  return {
    fetchMock,
    received,
    group: () => group,
    /** Another member changes the group meanwhile. */
    bump: (next: number) => { version += 1; group = { ...group, quantity: next, updatedAt: `g-${version}` }; },
    loseNextAnswer: () => { loseNextAnswer = true; },
  };
}

const OPEN = { isOpened: true, fillLevel: 100, openedAt: '2026-11-04T10:00:00.000Z' };

/** A real cache holding the wine ×6: its card, its drawer and the flat list. */
function wineCaches(quantity = 6) {
  const qc = new QueryClient();
  const g = { id: 'g', productId: 'p1', quantity, isOpened: false, fillLevel: 100, cigarsLeft: null, updatedAt: 'g-1' };
  qc.setQueryData(['inventory'], [{ ...g, name: 'Cuvée X' }]);
  qc.setQueryData(['inventory', 'products'], [{ id: 'p1', name: 'Cuvée X', items: [g] }]);
  qc.setQueryData(['inventory', 'product', 'p1'], { id: 'p1', name: 'Cuvée X', items: [g], tastings: [], history: [] });
  const card = () => (qc.getQueryData(['inventory', 'products']) as Array<{ items: Array<Record<string, unknown>> }>)[0].items;
  const drawer = () => (qc.getQueryData(['inventory', 'product', 'p1']) as { items: Array<Record<string, unknown>> }).items;
  const flat = () => qc.getQueryData(['inventory']) as Array<Record<string, unknown>>;
  return { qc, card, drawer, flat };
}
const lines = (units: Array<Record<string, unknown>>) => units.map((u) => [u.id, u.quantity, u.isOpened]);

describe('FEAT-108 — shown at once, sent once', () => {
  it('c1: opening one of a ×6 offline shows ×5 and one opened bottle waiting, everywhere — never the whole group opened', async () => {
    const { qc, card, drawer, flat } = wineCaches();
    cachedItems.set('g', { id: 'g', productId: 'p1', quantity: 6, isOpened: false, fillLevel: 100, updatedAt: 'g-1', name: 'Cuvée X' });
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });

    const provisional = provisionalIdOf(m.id);
    for (const shown of [card(), drawer(), flat()]) {
      expect(lines(shown)).toEqual([['g', 5, false], [provisional, 1, true]]);
    }
    // A reload while still offline shows the same (the offline copy).
    expect(lines([...cachedItems.values()] as Array<Record<string, unknown>>)).toEqual([['g', 5, false], [provisional, 1, true]]);
    expect(store.get(m.id)).toMatchObject({ itemId: 'g', expectedUpdatedAt: 'g-1', before: { quantity: 6 } });
  });

  it('c2: back online, the group is ×5 and the real opened bottle replaces the provisional one', async () => {
    const { qc, card, drawer } = wineCaches();
    await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(qc);

    expect(store.size).toBe(0);
    expect(server.group().quantity).toBe(5);
    for (const shown of [card(), drawer()]) {
      expect(lines(shown)).toEqual([['g', 5, false], ['s-2', 1, true]]);
      expect(shown.find((u) => u.id === 'g')?.updatedAt).toBe('g-2');
    }
  });

  it('review of K: two "J\'en ouvre une" on a ×6 replay against the GROUP\'s version — ×4, no conflict', async () => {
    const { qc, card } = wineCaches();
    await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    expect(lines(card()).map(([, q]) => q)).toEqual([4, 1, 1]);
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(qc);

    expect(server.received.map((r) => r.body.expectedUpdatedAt)).toEqual(['g-1', 'g-2']);
    expect(server.received.every((r) => r.url === '/api/inventory/g')).toBe(true);
    expect(store.size).toBe(0);
    expect(server.group().quantity).toBe(4);
    expect(lines(card())).toEqual([['g', 4, false], ['s-3', 1, true], ['s-2', 1, true]]);
  });

  it('after the first answer, the second change still waiting shows on top of it (×4, not ×5)', async () => {
    const { qc, card } = wineCaches();
    const first = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const second = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls += 1;
      return calls === 1 ? server.fetchMock(url, init) : errResponse(503);
    }));

    await flushQueue(qc);

    expect(store.has(first.id)).toBe(false);
    expect(store.get(second.id)).toMatchObject({ status: 'pending', expectedUpdatedAt: 'g-2' });
    expect(lines(card())).toEqual([['g', 4, false], [provisionalIdOf(second.id), 1, true], ['s-2', 1, true]]);
  });

  it('c3 / review N1: an opening replayed after its answer was lost is recognised by its opening time — done once, no conflict', async () => {
    const { qc, card } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);
    server.loseNextAnswer();

    await flushQueue(qc); // reached the server, no answer: still waiting
    expect(store.get(m.id)?.status).toBe('pending');
    cancelSyncRetry();
    await flushQueue(qc); // replayed: refused (409), then found on the server

    expect(server.group().quantity).toBe(5);
    expect(server.received.filter((r) => r.method === 'PATCH')).toHaveLength(2);
    expect(store.size).toBe(0);
    expect(lines(card())).toEqual([['g', 5, false], ['s-2', 1, true]]);
  });

  it('c3: a drink replayed after its answer was lost is refused (never a ×4) and left to the member', async () => {
    const { qc } = wineCaches();
    const m = await enqueueMutation(qc, 'g', { isOpened: true, fillLevel: 0 }, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);
    server.loseNextAnswer();

    await flushQueue(qc);
    cancelSyncRetry();
    await flushQueue(qc);

    expect(server.group().quantity).toBe(5);
    expect(store.get(m.id)).toMatchObject({ status: 'conflict', before: { quantity: 6 }, conflictServerItem: { quantity: 5 } });
  });

  it('an opening by someone else at another time is not taken for this one', async () => {
    const { qc } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);
    // Another device opens one meanwhile, a minute later.
    await server.fetchMock('/api/inventory/g', { method: 'PATCH', body: JSON.stringify({ ...OPEN, openedAt: '2026-11-04T10:01:00.000Z', expectedUpdatedAt: 'g-1' }) });

    await flushQueue(qc);

    expect(store.get(m.id)?.status).toBe('conflict');
    expect(server.group().quantity).toBe(5);
  });

  it('c4: changed by another member meanwhile, the action is a conflict, not applied, and the screen shows the server\'s line', async () => {
    const { qc, card, drawer } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    server.bump(3); // corrected to ×3 elsewhere
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(qc);

    expect(store.get(m.id)).toMatchObject({ status: 'conflict', conflictServerItem: { id: 'g', quantity: 3 } });
    expect(server.group().quantity).toBe(3);
    for (const shown of [card(), drawer()]) expect(lines(shown)).toEqual([['g', 3, false]]);
    expect(await overlayQueuedChanges([server.group() as unknown as InventoryItem])).toEqual([server.group()]);
  });

  it('"Garder ma version" on that conflict takes ONE copy off the group as it is now', async () => {
    const { qc, card } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    server.bump(3);
    vi.stubGlobal('fetch', server.fetchMock);
    await flushQueue(qc);

    await resolveConflictKeepLocal(m.id, qc);

    expect(server.group().quantity).toBe(2);
    expect(store.size).toBe(0);
    expect(lines(card())).toEqual([['g', 2, false], ['s-3', 1, true]]);
  });

  it('c5: "Corriger le nombre" offline shows ×5 waiting, then replays to its own route with its reason', async () => {
    const { qc, card, drawer } = wineCaches();
    const m = await enqueueMutation(qc, 'g', { quantity: 5, reason: 'written_off' }, 'g-1', { kind: 'correct', productId: 'p1' });
    expect(lines(card())).toEqual([['g', 5, false]]);
    expect(drawer().map((u) => [u.id, u.quantity, u.writtenOffAt != null])).toEqual([['g', 5, false], [provisionalIdOf(m.id), 1, true]]);
    // An opening made after it waits behind it, on the group.
    await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    vi.stubGlobal('fetch', server.fetchMock);

    await flushQueue(qc);

    expect(server.received[0]).toEqual({
      url: '/api/inventory/g/correct', method: 'POST', body: { quantity: 5, reason: 'written_off', expectedUpdatedAt: 'g-1' },
    });
    // The version carried over is the group's (in `changed`), not the write-off's (`data`).
    expect(server.received[1]).toMatchObject({ url: '/api/inventory/g', method: 'PATCH', body: { expectedUpdatedAt: 'g-2' } });
    expect(store.size).toBe(0);
    expect(server.group().quantity).toBe(4);
    expect(drawer().map((u) => u.id)).toEqual(['g', 's-3', 'w-2']);
  });

  it('a put-back replayed offline that joins an identical line (D8: survivor in data, the bottle in removedIds) leaves one line', async () => {
    const qc = new QueryClient();
    const sub = { id: 's', productId: 'p1', quantity: 1, isOpened: true, fillLevel: 60, parentItemId: null, updatedAt: 's-1' };
    const other = { id: 'h', productId: 'p1', quantity: 3, isOpened: false, fillLevel: 100, updatedAt: 'h-1' };
    qc.setQueryData(['inventory', 'products'], [{ id: 'p1', items: [other, sub] }]);
    qc.setQueryData(['inventory', 'product', 'p1'], { id: 'p1', items: [other, sub], tastings: [], history: [] });
    const m = await enqueueMutation(qc, 's', { isOpened: false, fillLevel: 100 }, 's-1', { productId: 'p1' });
    // A later change of that bottle: it no longer exists once joined.
    const later = await enqueueMutation(qc, 's', { purchasePrice: 12 }, 's-1', { productId: 'p1' });
    const joined = { ...other, quantity: 4, updatedAt: 'h-2' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/s') && !store.has(m.id)
      ? errResponse(404, { error: 'ITEM_NOT_FOUND' })
      : ({ ok: true, status: 200, json: async () => ({ data: joined, changed: [], removedIds: ['s'] }) } as Response))));

    await flushQueue(qc);

    const drawer = (qc.getQueryData(['inventory', 'product', 'p1']) as { items: Array<Record<string, unknown>> }).items;
    const card = (qc.getQueryData(['inventory', 'products']) as Array<{ items: Array<Record<string, unknown>> }>)[0].items;
    for (const shown of [drawer, card]) expect(shown.map((u) => [u.id, u.quantity])).toEqual([['h', 4]]);
    // Not carried to the absorbed bottle's version: the later change is refused, said in words.
    expect(store.get(later.id)).toMatchObject({ status: 'failed', errorCode: 'ITEM_NOT_FOUND', expectedUpdatedAt: 's-1' });
  });

  // FEAT-93 (lot S2): the choice of a cell is replayed as made; a line whose cells changed since refuses it, a conflict.
  it.each(['SLOT_CHANGED', 'SLOTS_TO_FREE_REQUIRED', 'SLOT_CHOICE_REQUIRED'])('a drink from a cell is replayed with its cell; %s is said as a change made meanwhile', async (code) => {
    queue({ id: 'p1', itemId: 'g', createdAt: 't1', patch: { isOpened: true, fillLevel: 0, fromSlotId: 'slot-1' } });
    const fetchMock = vi.fn(async () => errResponse(409, { error: code, details: { slots: [], unplaced: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ fromSlotId: 'slot-1' });
    expect(store.get('p1')).toMatchObject({ status: 'failed', errorCode: code });
    expect(refusalKey(code)).toBe(refusalKey('CONFLICT'));
  });

  it('a correction naming the cells to free is replayed with them', async () => {
    queue({ id: 'p1', itemId: 'g', createdAt: 't1', kind: 'correct', patch: { quantity: 4, reason: 'written_off', slotIds: ['slot-1'] } });
    const fetchMock = vi.fn(async () => errResponse(409, { error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 1, slots: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await flushQueue(fakeQueryClient());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/inventory/g/correct');
    expect(JSON.parse(init.body as string)).toMatchObject({ slotIds: ['slot-1'] });
    expect(store.get('p1')).toMatchObject({ status: 'failed', errorCode: 'SLOTS_TO_FREE_REQUIRED' });
  });

  it('a refusal said by its code (a tasting on the bottle) is kept for the panel', async () => {
    queue({ id: 'p1', itemId: 's', createdAt: 't1', patch: { isOpened: false, fillLevel: 100 } });
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(409, { error: 'TASTINGS_ON_ITEM' })));
    await flushQueue(fakeQueryClient());
    expect(store.get('p1')).toMatchObject({ status: 'failed', errorCode: 'TASTINGS_ON_ITEM' });
  });
});

describe('FEAT-108 — "Annuler" before the network is back', () => {
  it('drops the change and puts the copy back: ×5 → ×6', async () => {
    const { qc, card, drawer } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });

    expect(await discardQueuedMutation(m.id, qc)).toBe(true);

    expect(store.size).toBe(0);
    for (const shown of [card(), drawer()]) expect(lines(shown)).toEqual([['g', 6, false]]);
  });

  it('refuses once the change is being sent', async () => {
    const { qc } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    store.set(m.id, { ...store.get(m.id)!, status: 'syncing' });
    expect(await discardQueuedMutation(m.id, qc)).toBe(false);
    expect(store.has(m.id)).toBe(true);
  });

  it('review N4: « Annuler » pressed while the change is being sent is refused — it is recorded, not dropped', async () => {
    const { qc } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    const server = groupServer(6);
    let dropped: boolean | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      dropped = await discardQueuedMutation(m.id, qc);
      return server.fetchMock(url, init);
    }));

    await flushQueue(qc);

    expect(dropped).toBe(false);
    expect(server.group().quantity).toBe(5);
    expect(store.size).toBe(0);
  });

  it('review of #823: « Supprimer » in the panel on a change being sent leaves it — it is sent and recorded', async () => {
    const { qc } = wineCaches();
    const m = await enqueueMutation(qc, 'g', OPEN, 'g-1', { productId: 'p1' });
    store.set(m.id, { ...store.get(m.id)!, status: 'syncing' });

    expect(await removeQueuedMutation(m.id, qc)).toBe(false);
    expect(store.get(m.id)?.status).toBe('syncing');
    expect(await removeQueuedMutation(m.id)).toBe(false);
    expect(store.has(m.id)).toBe(true);
  });

  it('a change dropped while the replay runs is never sent', async () => {
    queue({ id: 'm1', itemId: 'A', createdAt: 't1' });
    queue({ id: 'm2', itemId: 'B', createdAt: 't2' });
    const fetchMock = vi.fn(async (url: string) => {
      store.delete('m2'); // "Annuler" pressed during the first request
      return okResponse({ id: url.split('/').pop(), updatedAt: 'x' });
    });
    vi.stubGlobal('fetch', fetchMock);
    await flushQueue(fakeQueryClient());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FEAT-108 — one replay at a time across tabs (review of #753)', () => {
  /** A Web Locks stand-in shared by "tabs": one holder at a time per name. */
  function fakeLocks() {
    let tail = Promise.resolve();
    const names: string[] = [];
    return {
      names,
      request: vi.fn((name: string, callback: () => Promise<unknown>) => {
        names.push(name);
        const run = tail.then(callback);
        tail = run.then(() => undefined, () => undefined);
        return run;
      }),
    };
  }

  it('replays inside the shared lock "glou-sync"', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { ...navigator, locks });
    queue({ id: 'm1', itemId: 'A', createdAt: 't1' });
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ id: 'A', updatedAt: 'x' })));

    await flushQueue(fakeQueryClient());

    expect(locks.names).toEqual([SYNC_LOCK_NAME]);
    expect(SYNC_LOCK_NAME).toBe('glou-sync');
    expect(store.size).toBe(0);
  });

  it('while another tab holds it, nothing is sent; then the change already sent there is not sent again', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { ...navigator, locks });
    queue({ id: 'm1', itemId: 'A', createdAt: 't1' });
    const fetchMock = vi.fn(async () => okResponse({ id: 'A', updatedAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);

    // The other tab: holds the lock while it sends m1 itself.
    let release!: () => void;
    const otherTab = locks.request(SYNC_LOCK_NAME, () => new Promise<void>((resolve) => { release = resolve; }));
    const thisTab = flushQueue(fakeQueryClient());
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    store.delete('m1'); // sent and cleared by the other tab
    release();
    await Promise.all([otherTab, thisTab]);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

'use client';
import type { QueryClient } from '@tanstack/react-query';
import { randomId } from '@/lib/uuid';
import { timeoutSignal } from '@/lib/api';
import type { InventoryItem } from '@/lib/inventory/types';
import {
  type QueuedMutation,
  getAllQueuedMutations,
  putQueuedMutation,
  deleteQueuedMutation,
  getQueuedMutation,
  patchCachedItem,
  putCachedItem,
} from './db';

// ─── FEAT-16/23 — offline sync engine ──────────────────────────────────────
// Scope reminder: covers the common inventory mutations only (edit a field,
// mark consumed/opened — the FEAT-77 flow), never the rest of the app. See
// .vibe/features/wip/FEAT-16/feature.md and FEAT-23/feature.md, and the
// "bornage volontaire" note in web/lib/offline/db.ts.
//
// Framework-agnostic on purpose (no React import besides types) so it can be
// driven equally by the `online` window event and by the `useOfflineSync`
// hook's mount effect.

// Must match `INVENTORY_KEY` / the per-item key in hooks/useInventory.ts —
// duplicated here (rather than imported) to avoid a circular module
// dependency (useInventory.ts calls into this module for `enqueueMutation`).
const INVENTORY_LIST_KEY = ['inventory'] as const;
const inventoryItemKey = (id: string) => ['inventory', id] as const;

let isFlushing = false;
const listeners = new Set<() => void>();

// #585: a temporary server failure (API restarting, database unavailable,
// rate limit, expired session…) leaves the queue pending and schedules its
// own next attempt, because nothing else would restart it: the connectivity
// probe keeps answering "online" while the API itself fails.
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 60_000;
/** Server answers "try again later" tolerated per change before it is
 * marked `failed` (about 8 minutes with the delays above). */
export const MAX_TEMPORARY_FAILURES = 10;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function scheduleRetry(queryClient: QueryClient): void {
  if (retryTimer) return;
  const delay = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** retryAttempt);
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue(queryClient);
  }, delay);
}

/** Drops the scheduled automatic retry, if any (tests, and a flush that went
 * through on its own). */
export function cancelSyncRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
}

function notifyListeners(): void {
  listeners.forEach((cb) => cb());
}

/** Subscribed by `useOfflineSync` to re-render whenever the queue changes
 * (IndexedDB itself has no built-in React reactivity). Single-tab only —
 * changes made in another browser tab are not broadcast; documented
 * limitation, see final implementation report. */
export function subscribeToSyncQueueChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ─── "Decide later" on a conflict (#585) ────────────────────────────────────
// Kept for the browser session rather than in the conflict dialog, which is
// mounted again by every page: a postponed conflict must not come back at the
// next navigation. It stays queued and flagged by the connectivity indicator.
const DEFERRED_CONFLICTS_KEY = 'glou.offline.deferredConflicts';

export function getDeferredConflictIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(DEFERRED_CONFLICTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function deferConflict(mutationId: string): void {
  if (typeof window === 'undefined') return;
  const ids = getDeferredConflictIds();
  if (!ids.includes(mutationId)) ids.push(mutationId);
  try {
    window.sessionStorage.setItem(DEFERRED_CONFLICTS_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the conflict simply comes back on the next page.
  }
  notifyListeners();
}

/** "Resolve" from the pending changes panel: the postponed conflict comes
 * back in the conflict dialog. */
export function undeferConflict(mutationId: string): void {
  if (typeof window === 'undefined') return;
  const ids = getDeferredConflictIds().filter((id) => id !== mutationId);
  try {
    window.sessionStorage.setItem(DEFERRED_CONFLICTS_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: nothing was remembered either.
  }
  notifyListeners();
}

/**
 * #585: the inventory as the device should show it — the server's list with
 * the changes still queued on this device laid over it, so a refetch (after
 * another change went through, or a page load) does not wipe them from the
 * screen while they wait. A change in conflict is left out: the dialog shows
 * both versions. Best effort: without IndexedDB the list is returned as is.
 */
export async function overlayQueuedChanges(items: InventoryItem[]): Promise<InventoryItem[]> {
  let queued: QueuedMutation[];
  try {
    queued = (await getAllQueuedMutations()).filter((m) => m.status !== 'conflict');
  } catch {
    return items;
  }
  if (queued.length === 0) return items;
  return items.map((item) =>
    queued.reduce<InventoryItem>((shown, m) => (m.itemId === item.id ? { ...shown, ...m.patch } : shown), item),
  );
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  return getAllQueuedMutations();
}

/**
 * Queues a mutation for later sync AND applies it optimistically to the
 * React Query cache (list + single-item) so the UI reflects the change
 * immediately — Optimistic UI, per .agent/workflows/4-implementation.md.
 * Also mirrors the patch into the IndexedDB `inventory_cache` so a reload
 * while still offline still shows the pending edit.
 */
export async function enqueueMutation(
  queryClient: QueryClient,
  itemId: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: randomId(),
    itemId,
    patch,
    expectedUpdatedAt,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await putQueuedMutation(mutation);
  await patchCachedItem(itemId, patch);

  queryClient.setQueryData<InventoryItem[]>(INVENTORY_LIST_KEY, (old) =>
    old?.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
  );
  queryClient.setQueryData<InventoryItem>(inventoryItemKey(itemId), (old) =>
    old ? { ...old, ...patch } : old
  );

  notifyListeners();
  return mutation;
}

/** Lets the user discard an action that hasn't synced yet (explicit
 * acceptance criterion of FEAT-16/23). Does NOT revert the optimistic cache
 * patch — the item is left invalidated so the next successful fetch
 * restores the true server state. */
export async function removeQueuedMutation(id: string, queryClient?: QueryClient): Promise<void> {
  await deleteQueuedMutation(id);
  if (queryClient) {
    void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  }
  notifyListeners();
}

/** Puts a `failed` mutation back in the queue so the next flush retries it
 * (and the later edits of the same item, blocked behind it, can follow). */
export async function retryFailedMutation(id: string, queryClient: QueryClient): Promise<void> {
  await markMutation(id, { status: 'pending', errorReason: undefined, temporaryFailures: 0 });
  await flushQueue(queryClient);
}

async function markMutation(id: string, patch: Partial<QueuedMutation>): Promise<void> {
  const existing = await getQueuedMutation(id);
  if (!existing) return;
  await putQueuedMutation({ ...existing, ...patch });
  notifyListeners();
}

type PatchOutcome =
  | { kind: 'success'; item: InventoryItem }
  | { kind: 'conflict'; serverItem: InventoryItem }
  /** Temporary. `reason` is set only for an answer from the server that
   * says "try again later" (408, 429, 5xx): those count towards
   * MAX_TEMPORARY_FAILURES. No answer (offline) and a session problem (401,
   * 403 `2FA_REQUIRED`) leave it unset: they depend on the network or the
   * session, not on the change, and wait as long as needed. */
  | { kind: 'retry'; reason?: string }
  /** A real refusal of this change (validation, forbidden, gone…). */
  | { kind: 'error'; message: string };

/** #585: statuses that say nothing about the change itself — the request
 * timed out, the rate limit was hit or the server is failing or restarting.
 * The change stays queued and is tried again. */
function isTemporaryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Raw PATCH call to the inventory API — deliberately NOT reusing
 * `lib/api.ts`'s `client.patch`: that helper collapses any non-2xx response
 * into a plain `Error` and discards the parsed body, but the offline sync
 * flow specifically needs the HTTP status (409) and the server's current
 * item from the response body to drive conflict resolution.
 */
async function patchInventoryItem(itemId: string, patch: Record<string, unknown>): Promise<PatchOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/inventory/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
      signal: timeoutSignal(15000),
    });
  } catch {
    // Network cut or timeout: the server never answered.
    return { kind: 'retry' };
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { data?: InventoryItem } | null;
    if (body?.data) return { kind: 'conflict', serverItem: body.data };
    return { kind: 'error', message: 'CONFLICT' };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
    const reason = body?.details ?? body?.error ?? `HTTP ${res.status}`;
    // An expired session (401) or one waiting for its second factor (403
    // `2FA_REQUIRED`, api/src/middleware/auth.middleware.ts): nothing wrong
    // with the change, it goes through once the member has signed in again,
    // however long that takes — never counted as a refusal.
    if (res.status === 401 || body?.error === '2FA_REQUIRED') return { kind: 'retry' };
    if (isTemporaryStatus(res.status)) return { kind: 'retry', reason };
    return { kind: 'error', message: reason };
  }
  const body = (await res.json()) as { data: InventoryItem };
  return { kind: 'success', item: body.data };
}

/**
 * Replays every `pending` mutation against the real API, in FIFO order
 * (FEAT-23: "synchronisées dans l'ordre d'émission" — `sync_queue`'s
 * `by-createdAt` index guarantees this). A mutation that fails or conflicts
 * blocks only the *later* mutations queued for the *same item* (applying
 * mutation #2 on top of a base state mutation #1 never actually reached
 * would corrupt that item's history) — independent items keep flushing.
 *
 * #585: every change queued on the device for an item was made on top of
 * the previous queued change of that item, so once one goes through, the
 * version the server returns becomes the expected version of the later
 * ones (persisted, so it survives a retry or a reload). Each change stays a
 * separate request: two "I drink one" on the same group are two operations,
 * never merged. A temporary failure puts the change back to `pending`, stops
 * the replay (the server is unavailable for every item) and schedules
 * another attempt.
 */
export async function flushQueue(queryClient: QueryClient): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  let anySynced = false;
  try {
    const queued = await getAllQueuedMutations();
    // A mutation can be left in `syncing` if the tab closed or the network
    // dropped mid-request (the previous flush never got to record success,
    // conflict or failure). Only one flush ever runs at a time (`isFlushing`
    // above), so a `syncing` row here is always stale — reset it to `pending`
    // so the queue self-heals instead of leaving it, and everything queued
    // after it, stuck forever.
    for (const mutation of queued) {
      if (mutation.status === 'syncing') {
        mutation.status = 'pending';
        await markMutation(mutation.id, { status: 'pending' });
      }
    }
    const blockedItemIds = new Set<string>();
    let mustRetry = false;

    for (const mutation of queued) {
      if (mutation.status !== 'pending') {
        // Already failed/conflicted from a previous flush attempt — leave it
        // for the user to resolve, and don't let later mutations on the
        // same item jump ahead of it.
        blockedItemIds.add(mutation.itemId);
        continue;
      }
      if (blockedItemIds.has(mutation.itemId)) continue;

      await markMutation(mutation.id, { status: 'syncing' });

      // Re-read: an earlier success in this replay may have moved the
      // expected version forward (see `rebaseLaterMutations`).
      const current = (await getQueuedMutation(mutation.id)) ?? mutation;
      const outcome = await patchInventoryItem(current.itemId, {
        ...current.patch,
        expectedUpdatedAt: current.expectedUpdatedAt,
      });

      if (outcome.kind === 'success') {
        await deleteQueuedMutation(mutation.id);
        anySynced = true;
        const later = await rebaseLaterMutations(mutation, outcome.item.updatedAt);
        // Keep showing the changes still waiting for this item on top of
        // the server's answer.
        const shown = later.reduce<InventoryItem>((item, m) => ({ ...item, ...m.patch }), outcome.item);
        await putCachedItem(shown);
        queryClient.setQueryData<InventoryItem[]>(INVENTORY_LIST_KEY, (old) =>
          old?.map((item) => (item.id === shown.id ? shown : item))
        );
        queryClient.setQueryData(inventoryItemKey(shown.id), shown);
        notifyListeners();
      } else if (outcome.kind === 'retry') {
        const failures = (current.temporaryFailures ?? 0) + (outcome.reason ? 1 : 0);
        if (outcome.reason && failures >= MAX_TEMPORARY_FAILURES) {
          // The server keeps refusing this one: hand it to the member
          // (Retry / Discard) and let the rest of the queue have its turn.
          await markMutation(mutation.id, { status: 'failed', errorReason: outcome.reason, temporaryFailures: failures });
          blockedItemIds.add(mutation.itemId);
          continue;
        }
        await markMutation(mutation.id, { status: 'pending', temporaryFailures: failures });
        mustRetry = true;
        break;
      } else if (outcome.kind === 'conflict') {
        await markMutation(mutation.id, { status: 'conflict', conflictServerItem: outcome.serverItem });
        blockedItemIds.add(mutation.itemId);
      } else {
        await markMutation(mutation.id, { status: 'failed', errorReason: outcome.message });
        blockedItemIds.add(mutation.itemId);
      }
    }
    if (mustRetry) scheduleRetry(queryClient);
    else cancelSyncRetry();
  } finally {
    isFlushing = false;
    // Refetch only when something reached the server; the refetched list
    // keeps the changes still queued on top (`overlayQueuedChanges`).
    if (anySynced) void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  }
}

/**
 * #585: after a change of `done.itemId` went through, the later queued
 * changes of the same item now expect the version the server just returned
 * (they were made on the device on top of that change). Returns them, in
 * queue order.
 */
async function rebaseLaterMutations(done: QueuedMutation, newUpdatedAt: string): Promise<QueuedMutation[]> {
  const later = (await getAllQueuedMutations()).filter(
    (m) => m.itemId === done.itemId && m.id !== done.id && m.createdAt >= done.createdAt,
  );
  const rebased: QueuedMutation[] = [];
  for (const listed of later) {
    // Read again right before writing: the member may have discarded it
    // meanwhile, and writing it back would revive it.
    const m = await getQueuedMutation(listed.id);
    if (!m) continue;
    // A conflict keeps the version it was compared with: the user decides.
    const next = m.status === 'conflict' ? m : { ...m, expectedUpdatedAt: newUpdatedAt };
    if (next !== m) await putQueuedMutation(next);
    rebased.push(next);
  }
  return rebased;
}

/**
 * Conflict resolution actions (used by `ConflictResolutionModal`).
 *  - `keepLocal`: re-queue the same patch, but overwrite the
 *    `expectedUpdatedAt` with the server's current value so the next flush
 *    applies unconditionally (the user explicitly chose to overwrite).
 *  - `keepServer`: drop the local mutation entirely and let the normal
 *    inventory refetch pull in the server's version.
 */
export async function resolveConflictKeepLocal(mutationId: string, queryClient: QueryClient): Promise<void> {
  const mutation = await getQueuedMutation(mutationId);
  if (!mutation || !mutation.conflictServerItem) return;
  await putQueuedMutation({
    ...mutation,
    status: 'pending',
    expectedUpdatedAt: mutation.conflictServerItem.updatedAt,
    conflictServerItem: undefined,
  });
  notifyListeners();
  await flushQueue(queryClient);
}

export async function resolveConflictKeepServer(mutationId: string, queryClient: QueryClient): Promise<void> {
  const mutation = await getQueuedMutation(mutationId);
  await deleteQueuedMutation(mutationId);
  if (mutation?.conflictServerItem) {
    await putCachedItem(mutation.conflictServerItem);
    queryClient.setQueryData(inventoryItemKey(mutation.itemId), mutation.conflictServerItem);
  }
  void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  notifyListeners();
}

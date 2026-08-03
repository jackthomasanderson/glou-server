'use client';
import type { QueryClient } from '@tanstack/react-query';
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
    id: crypto.randomUUID(),
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

async function markMutation(id: string, patch: Partial<QueuedMutation>): Promise<void> {
  const existing = await getQueuedMutation(id);
  if (!existing) return;
  await putQueuedMutation({ ...existing, ...patch });
  notifyListeners();
}

type PatchOutcome =
  | { kind: 'success'; item: InventoryItem }
  | { kind: 'conflict'; serverItem: InventoryItem }
  | { kind: 'error'; message: string };

/**
 * Raw PATCH call to the inventory API — deliberately NOT reusing
 * `lib/api.ts`'s `client.patch`: that helper collapses any non-2xx response
 * into a plain `Error` and discards the parsed body, but the offline sync
 * flow specifically needs the HTTP status (409) and the server's current
 * item from the response body to drive conflict resolution.
 */
async function patchInventoryItem(itemId: string, patch: Record<string, unknown>): Promise<PatchOutcome> {
  const res = await fetch(`/api/inventory/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { data?: InventoryItem } | null;
    if (body?.data) return { kind: 'conflict', serverItem: body.data };
    return { kind: 'error', message: 'CONFLICT' };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
    return { kind: 'error', message: body?.details ?? body?.error ?? `HTTP ${res.status}` };
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
 */
export async function flushQueue(queryClient: QueryClient): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const queued = await getAllQueuedMutations();
    const blockedItemIds = new Set<string>();

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

      const outcome = await patchInventoryItem(mutation.itemId, {
        ...mutation.patch,
        expectedUpdatedAt: mutation.expectedUpdatedAt,
      });

      if (outcome.kind === 'success') {
        await deleteQueuedMutation(mutation.id);
        await putCachedItem(outcome.item);
        queryClient.setQueryData<InventoryItem[]>(INVENTORY_LIST_KEY, (old) =>
          old?.map((item) => (item.id === outcome.item.id ? outcome.item : item))
        );
        queryClient.setQueryData(inventoryItemKey(outcome.item.id), outcome.item);
        notifyListeners();
      } else if (outcome.kind === 'conflict') {
        await markMutation(mutation.id, { status: 'conflict', conflictServerItem: outcome.serverItem });
        blockedItemIds.add(mutation.itemId);
      } else {
        await markMutation(mutation.id, { status: 'failed', errorReason: outcome.message });
        blockedItemIds.add(mutation.itemId);
      }
    }
  } finally {
    isFlushing = false;
    void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  }
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

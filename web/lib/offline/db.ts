import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { InventoryItem } from '@/lib/inventory/types';
import type { UnitBefore } from './optimistic';

// ─── FEAT-16/23 — offline cache + sync queue (IndexedDB via `idb`) ─────────
// Scope reminder (see .vibe/features/wip/FEAT-16/feature.md and FEAT-23):
// this store mirrors the already-loaded inventory list for offline READ
// access, and queues the common inventory mutations made while offline
// (edit a field, mark consumed/opened — the existing FEAT-77 flow). It does
// NOT attempt to make the rest of the app (map, wishlist, onboarding
// wizard, CSV import...) work offline.

export type SyncMutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface QueuedMutation {
  /** uuid, generated client-side at enqueue time via `crypto.randomUUID()`. */
  id: string;
  itemId: string;
  /**
   * FEAT-108: which request replays it — `patch` (default, the changes
   * queued before FEAT-108 have none): PATCH /api/inventory/:id with
   * `patch`; `correct`: POST /api/inventory/:id/correct ("Corriger le
   * nombre", `patch` = `{ quantity, reason }`).
   */
  kind?: 'patch' | 'correct';
  /** FEAT-108: the wine of the unit, whose drawer shows the change. */
  productId?: string;
  /** FEAT-108: the unit as shown when the change was made — to take the change back ("Annuler"). */
  before?: UnitBefore;
  patch: Record<string, unknown>;
  /**
   * `updatedAt` of the item AS KNOWN at enqueue time — sent back to the
   * server as `expectedUpdatedAt` for optimistic-concurrency conflict
   * detection (see api/src/services/inventory.service.ts::updateItem).
   */
  expectedUpdatedAt: string;
  /** ISO timestamp — also the FIFO ordering key (`by-createdAt` index). */
  createdAt: string;
  status: SyncMutationStatus;
  /** Populated only when `status === 'conflict'`: the server's current item
   * state, for the conflict-resolution UI to diff against. */
  conflictServerItem?: InventoryItem;
  /** Populated only when `status === 'failed'`: a short reason so the UI can
   * explain why a retry is needed. Not i18n-translated (it's a raw error
   * message for diagnostics); the UI shows a generic translated label plus
   * this as supporting detail. */
  errorReason?: string;
  /** FEAT-108: the API's error code of a refusal (`TASTINGS_ON_ITEM`…), said in words by the UI. */
  errorCode?: string;
  /** #585: how many times the server answered "try again later" (5xx,
   * 429…) to this change. Past a limit it is marked `failed`, so a server
   * that keeps refusing does not hold the queue forever. A request that got
   * no answer at all (offline) does not count. */
  temporaryFailures?: number;
}

interface GlouOfflineDB extends DBSchema {
  inventory_cache: {
    key: string; // item id
    value: InventoryItem;
  };
  sync_queue: {
    key: string; // mutation id (uuid)
    value: QueuedMutation;
    indexes: { 'by-createdAt': string };
  };
}

const DB_NAME = 'glou-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GlouOfflineDB>> | null = null;

/**
 * Lazily opens (and memoizes) the IndexedDB connection. Must only be called
 * client-side — IndexedDB does not exist during SSR/RSC rendering.
 */
function getOfflineDB(): Promise<IDBPDatabase<GlouOfflineDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('getOfflineDB() called outside the browser (no IndexedDB during SSR)'));
  }
  if (!dbPromise) {
    dbPromise = openDB<GlouOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('inventory_cache')) {
          db.createObjectStore('inventory_cache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
          store.createIndex('by-createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

// ─── inventory_cache helpers ────────────────────────────────────────────────

/** Overwrites the mirrored inventory snapshot with the freshly-fetched list. */
export async function mirrorInventoryToCache(items: InventoryItem[]): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction('inventory_cache', 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map((item) => tx.store.put(item)));
  await tx.done;
}

/** Reads the last mirrored inventory snapshot — used as an offline fallback
 * when the network request in `useInventory` fails. */
export async function getCachedInventory(): Promise<InventoryItem[]> {
  const db = await getOfflineDB();
  return db.getAll('inventory_cache');
}

/**
 * FEAT-108: rewrites the offline copy of the bottles through `change` (a
 * queued change shown, an answer of the server applied). Only the rows
 * `change` returns as new objects are written; those it drops are deleted.
 */
export async function rewriteCachedItems(change: (items: InventoryItem[]) => InventoryItem[]): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction('inventory_cache', 'readwrite');
  const before = await tx.store.getAll();
  const after = change(before);
  const known = new Set(before);
  const kept = new Set(after.map((item) => item.id));
  await Promise.all([
    ...after.filter((item) => !known.has(item)).map((item) => tx.store.put(item)),
    ...before.filter((item) => !kept.has(item.id)).map((item) => tx.store.delete(item.id)),
  ]);
  await tx.done;
}

// ─── sync_queue helpers ──────────────────────────────────────────────────────

/** All queued mutations, FIFO-ordered by `createdAt` (emission order — see
 * `flushQueue` in syncEngine.ts, which replays them in this exact order). */
export async function getAllQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex('sync_queue', 'by-createdAt');
}

export async function putQueuedMutation(mutation: QueuedMutation): Promise<void> {
  const db = await getOfflineDB();
  await db.put('sync_queue', mutation);
}

/**
 * FEAT-108 (review of #823): takes a change for sending — only if it is
 * still `pending` — and marks it `syncing`, in ONE transaction: an
 * « Annuler » can no longer drop it between the check and the mark (and
 * see it sent anyway). Undefined when it is gone or not pending.
 */
export async function claimQueuedMutation(id: string): Promise<QueuedMutation | undefined> {
  const db = await getOfflineDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const found = await tx.store.get(id);
  let claimed: QueuedMutation | undefined;
  if (found && found.status === 'pending') {
    claimed = { ...found, status: 'syncing' };
    await tx.store.put(claimed);
  }
  await tx.done;
  return claimed;
}

/**
 * FEAT-108 (review of #823): drops a change unless it is being sent, in ONE
 * transaction (« Annuler » racing the replay). Returns what was dropped.
 */
export async function takeQueuedMutationUnlessSyncing(id: string): Promise<QueuedMutation | undefined> {
  const db = await getOfflineDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const found = await tx.store.get(id);
  const taken = found && found.status !== 'syncing' ? found : undefined;
  if (taken) await tx.store.delete(id);
  await tx.done;
  return taken;
}

export async function deleteQueuedMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('sync_queue', id);
}

export async function getQueuedMutation(id: string): Promise<QueuedMutation | undefined> {
  const db = await getOfflineDB();
  return db.get('sync_queue', id);
}

// ─── Logout cleanup (security) ───────────────────────────────────────────────

/**
 * Wipes both offline stores (mirrored inventory snapshot + pending sync
 * queue). Called on logout (see web/hooks/useAuth.ts#useLogout) so a shared
 * household device doesn't retain readable inventory data — or stale queued
 * mutations belonging to the account that just signed out — in IndexedDB
 * after sign-out.
 */
export async function clearOfflineData(): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await getOfflineDB();
  await Promise.all([db.clear('inventory_cache'), db.clear('sync_queue')]);
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { InventoryItem } from '@/lib/inventory/types';

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
 * Applies a partial patch to a single cached item (best-effort — keeps the
 * IndexedDB mirror consistent with an optimistic UI update so a page reload
 * while still offline doesn't show stale data). No-op if the item isn't in
 * the cache yet.
 */
export async function patchCachedItem(itemId: string, patch: Record<string, unknown>): Promise<void> {
  const db = await getOfflineDB();
  const existing = await db.get('inventory_cache', itemId);
  if (!existing) return;
  await db.put('inventory_cache', { ...existing, ...patch });
}

/** Replaces a single cached item with the authoritative server state
 * (used after a successful sync or a resolved conflict). */
export async function putCachedItem(item: InventoryItem): Promise<void> {
  const db = await getOfflineDB();
  await db.put('inventory_cache', item);
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

export async function deleteQueuedMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('sync_queue', id);
}

export async function getQueuedMutation(id: string): Promise<QueuedMutation | undefined> {
  const db = await getOfflineDB();
  return db.get('sync_queue', id);
}

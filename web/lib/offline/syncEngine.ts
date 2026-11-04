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
  rewriteCachedItems,
  claimQueuedMutation,
  takeQueuedMutationUnlessSyncing,
} from './db';
import {
  actionOf, applyChange, beforeOf, overlayChanges, provisionalIdOf, revertChange, unitInStock, type UnitLike,
} from './optimistic';

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
// #471: the wines (hooks/useProducts.ts `PRODUCTS_KEY`) and every open
// drawer (`productDetailKey(id)`), duplicated for the same reason.
const PRODUCTS_LIST_KEY = ['inventory', 'products'] as const;
const PRODUCT_DETAIL_PREFIX = ['inventory', 'product'] as const;

/**
 * Review of #753: every tab runs its own replay on the same IndexedDB queue;
 * without a lock shared by the tabs, two of them could send the same change
 * (the second one answered 409, a conflict with oneself). The Web Locks API
 * runs one replay at a time across the tabs of the origin; a browser without
 * it keeps the per-tab guard only.
 */
export const SYNC_LOCK_NAME = 'glou-sync';

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

/** The changes still shown on screen: every queued one but those in conflict (the dialog shows both versions). */
async function shownChanges(): Promise<QueuedMutation[]> {
  return (await getAllQueuedMutations()).filter((m) => m.status !== 'conflict');
}

/**
 * #585: the inventory as the device should show it — the server's list with
 * the changes still queued on this device laid over it, so a refetch (after
 * another change went through, or a page load) does not wipe them from the
 * screen while they wait. FEAT-108: a copy opened, drunk or smoked out of a
 * group shows as a provisional copy, the group one fewer. Best effort:
 * without IndexedDB the list is returned as is.
 */
export async function overlayQueuedChanges(items: InventoryItem[]): Promise<InventoryItem[]> {
  return overlayQueuedUnits(items);
}

/** {@link overlayQueuedChanges} for any list of units (a wine's card, its drawer). */
export async function overlayQueuedUnits<T extends { id: string }>(units: T[]): Promise<T[]> {
  let queued: QueuedMutation[];
  try {
    queued = await shownChanges();
  } catch {
    return units;
  }
  if (queued.length === 0) return units;
  return overlayChanges(units as unknown as UnitLike[], queued) as unknown as T[];
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  return getAllQueuedMutations();
}

type WithUnits = { id: string; items: UnitLike[] };
/** A change of the units of one list; `owner` is the wine the list belongs to (none: the flat list of every bottle). */
type UnitsChange = (units: UnitLike[], owner?: string) => UnitLike[];

const sameUnits = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((unit, i) => unit === b[i]);

/**
 * FEAT-108: applies `change` to every copy of the units the device keeps —
 * the offline copy (IndexedDB) first, then the flat list, the wines' cards
 * and the open drawers. A list `change` leaves alone is not touched.
 */
async function updateUnitCaches(queryClient: QueryClient, change: UnitsChange): Promise<void> {
  try {
    await rewriteCachedItems((items) => change(items as unknown as UnitLike[]) as unknown as InventoryItem[]);
  } catch {
    // IndexedDB unavailable (private browsing): the screen still follows.
  }
  queryClient.setQueryData<InventoryItem[]>(INVENTORY_LIST_KEY, (old) => {
    if (!old) return old;
    const next = change(old as unknown as UnitLike[]);
    return sameUnits(old, next) ? old : (next as unknown as InventoryItem[]);
  });
  queryClient.setQueryData<WithUnits[]>(PRODUCTS_LIST_KEY, (old) => old?.map((product) => {
    const next = change(product.items, product.id);
    // A wine's card lists only what is in the cellar.
    return sameUnits(product.items, next) ? product : { ...product, items: next.filter(unitInStock) };
  }));
  queryClient.setQueriesData<WithUnits>({ queryKey: PRODUCT_DETAIL_PREFIX }, (old) => {
    if (!old || !Array.isArray(old.items)) return old;
    const next = change(old.items, old.id);
    return sameUnits(old.items, next) ? old : { ...old, items: next };
  });
}

/** The unit as the device shows it now, from whichever list holds it. */
function shownUnit(queryClient: QueryClient, itemId: string): UnitLike | undefined {
  const flat = queryClient.getQueryData<UnitLike[]>(INVENTORY_LIST_KEY)?.find((unit) => unit.id === itemId);
  if (flat) return flat;
  const products = queryClient.getQueryData<WithUnits[]>(PRODUCTS_LIST_KEY);
  for (const product of products ?? []) {
    const unit = product.items.find((u) => u.id === itemId);
    if (unit) return unit;
  }
  return undefined;
}

export interface EnqueueOptions {
  /** `correct`: "Corriger le nombre" (POST /api/inventory/:id/correct, `patch` = `{ quantity, reason }`). */
  kind?: 'patch' | 'correct';
  /** The wine of the unit. */
  productId?: string | null;
  /** The unit as shown when the change was made (else read from the lists). */
  shown?: UnitLike;
}

/**
 * Queues a mutation for later sync AND shows it at once — Optimistic UI, per
 * .agent/workflows/4-implementation.md — in the offline copy (a reload while
 * still offline keeps it), the flat list, the wines' cards and the open
 * drawers. FEAT-108: opening, drinking or smoking one copy of a group shows
 * the group one fewer and the copy on its own line, waiting ("en attente");
 * never the whole group opened.
 */
export async function enqueueMutation(
  queryClient: QueryClient,
  itemId: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string,
  options: EnqueueOptions = {},
): Promise<QueuedMutation> {
  const shown = options.shown ?? shownUnit(queryClient, itemId);
  const mutation: QueuedMutation = {
    id: randomId(),
    itemId,
    ...(options.kind === 'correct' ? { kind: 'correct' as const } : {}),
    ...(options.productId ? { productId: options.productId } : {}),
    ...(shown ? { before: beforeOf(shown) } : {}),
    patch,
    expectedUpdatedAt,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await putQueuedMutation(mutation);
  await updateUnitCaches(queryClient, (units) => applyChange(units, mutation));
  queryClient.setQueryData<InventoryItem>(inventoryItemKey(itemId), (old) =>
    old ? (applyChange([old as unknown as UnitLike], mutation)[0] as unknown as InventoryItem) : old);

  notifyListeners();
  return mutation;
}

/**
 * What a queued change shows for the unit it was made on: the provisional
 * copy taken off a group, else the unit itself as changed.
 */
export function shownAfter<T extends { id: string }>(unit: T, mutation: QueuedMutation): T {
  const [changed, copy] = applyChange([unit as unknown as UnitLike], mutation);
  return (copy ?? changed) as unknown as T;
}

// A result resolved from the offline queue rather than from the server:
// the caller must not write it into the caches again (they already show it).
const queuedResults = new WeakMap<object, string>();

/** Marks `result` as shown from the queued change `mutationId`. */
export function markQueuedResult<T extends object>(result: T, mutationId: string): T {
  queuedResults.set(result, mutationId);
  return result;
}

/** The queued change a result comes from, if it never reached the server. */
export function queuedMutationOf(result: object | null | undefined): string | undefined {
  return result ? queuedResults.get(result) : undefined;
}

/**
 * FEAT-108: "Annuler" right after an action made without network, or
 * "Abandonner" in the pending changes panel — the change is dropped and its
 * effect taken back (×5 → ×6). False when it is no longer waiting (being
 * sent, or already gone).
 */
export async function discardQueuedMutation(id: string, queryClient: QueryClient): Promise<boolean> {
  // Checked and dropped at once: never dropped while the replay sends it.
  const mutation = await takeQueuedMutationUnlessSyncing(id);
  if (!mutation) return false;
  // A change in conflict no longer shows: nothing to take back.
  if (mutation.status !== 'conflict') {
    await updateUnitCaches(queryClient, (units) => revertChange(units, mutation, mutation.before));
  }
  notifyListeners();
  return true;
}

/** Lets the user discard an action that hasn't synced yet (explicit
 * acceptance criterion of FEAT-16/23); the list is then read again so the
 * server's state comes back. False when it is being sent (review of #823):
 * it is then recorded — never hidden from the panel while it goes through. */
export async function removeQueuedMutation(id: string, queryClient?: QueryClient): Promise<boolean> {
  let dropped: boolean;
  if (queryClient) {
    // FEAT-108: its effect is taken back on screen at once, even offline.
    dropped = await discardQueuedMutation(id, queryClient);
    if (dropped) void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  } else {
    dropped = (await takeQueuedMutationUnlessSyncing(id)) !== undefined;
  }
  notifyListeners();
  return dropped;
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

/** D8 (#471): the unit written, the others the same write changed, those it removed. */
interface ServerWrite {
  data: UnitLike;
  changed: UnitLike[];
  removedIds: string[];
}

type PatchOutcome =
  | { kind: 'success'; write: ServerWrite }
  | { kind: 'conflict'; serverItem: InventoryItem }
  /** Temporary. `reason` is set only for an answer from the server that
   * says "try again later" (408, 429, 5xx): those count towards
   * MAX_TEMPORARY_FAILURES. No answer (offline) and a session problem (401,
   * 403 `2FA_REQUIRED`) leave it unset: they depend on the network or the
   * session, not on the change, and wait as long as needed. */
  | { kind: 'retry'; reason?: string }
  /** A real refusal of this change (validation, forbidden, gone…); `code`: the API's error code. */
  | { kind: 'error'; message: string; code?: string };

/** #585: statuses that say nothing about the change itself — the request
 * timed out, the rate limit was hit or the server is failing or restarting.
 * The change stays queued and is tried again. */
function isTemporaryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Raw call to the inventory API — deliberately NOT reusing `lib/api.ts`'s
 * `client.patch`: that helper collapses any non-2xx response into a plain
 * `Error` and discards the parsed body, but the offline sync flow
 * specifically needs the HTTP status (409) and the server's current item
 * from the response body to drive conflict resolution. FEAT-108: a
 * "Corriger le nombre" goes to its own route, with the same guard.
 */
async function sendChange(mutation: QueuedMutation): Promise<PatchOutcome> {
  const isCorrection = mutation.kind === 'correct';
  let res: Response;
  try {
    res = await fetch(`/api/inventory/${mutation.itemId}${isCorrection ? '/correct' : ''}`, {
      method: isCorrection ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...mutation.patch, expectedUpdatedAt: mutation.expectedUpdatedAt }),
      signal: timeoutSignal(15000),
    });
  } catch {
    // Network cut or timeout: the server never answered.
    return { kind: 'retry' };
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { data?: InventoryItem; error?: string } | null;
    if (body?.data) return { kind: 'conflict', serverItem: body.data };
    // A refusal answered 409 without the unit (a tasting noted on the
    // bottle, nothing left to smoke…): said in words by the panel.
    return { kind: 'error', message: body?.error ?? 'CONFLICT', code: body?.error ?? 'CONFLICT' };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; details?: unknown } | null;
    const reason = (typeof body?.details === 'string' ? body.details : undefined) ?? body?.error ?? `HTTP ${res.status}`;
    // An expired session (401) or one waiting for its second factor (403
    // `2FA_REQUIRED`, api/src/middleware/auth.middleware.ts): nothing wrong
    // with the change, it goes through once the member has signed in again,
    // however long that takes — never counted as a refusal.
    if (res.status === 401 || body?.error === '2FA_REQUIRED') return { kind: 'retry' };
    if (isTemporaryStatus(res.status)) return { kind: 'retry', reason };
    return { kind: 'error', message: reason, ...(body?.error ? { code: body.error } : {}) };
  }
  const body = (await res.json()) as { data: UnitLike; changed?: UnitLike[]; removedIds?: string[] };
  return { kind: 'success', write: { data: body.data, changed: body.changed ?? [], removedIds: body.removedIds ?? [] } };
}

const sameInstant = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && new Date(a).getTime() === new Date(b).getTime();

/**
 * Review of #823 (N1): a change can reach the server and its answer be lost
 * (the network drops during the send). Replayed, it is refused (409) since
 * the unit moved on. An opening carries its own opening time, to the
 * millisecond: if the server holds an opened copy of that group (or the
 * unit itself) opened at that very time, the opening went through — the
 * answer is rebuilt as D8 (the copy, the group as it is now). Null when
 * not found, or for any other change (the dialog then says the action may
 * already be recorded).
 */
async function alreadyApplied(mutation: QueuedMutation, serverItem: InventoryItem): Promise<ServerWrite | null> {
  if (mutation.kind === 'correct' || actionOf(mutation) !== 'open' || typeof mutation.patch.openedAt !== 'string') return null;
  const openedAt = mutation.patch.openedAt;
  const server = serverItem as unknown as UnitLike;
  if (server.isOpened === true && sameInstant(server.openedAt, openedAt)) return { data: server, changed: [], removedIds: [] };
  const productId = mutation.productId ?? (typeof server.productId === 'string' ? server.productId : undefined);
  if (!productId) return null;
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
      credentials: 'include',
      signal: timeoutSignal(15000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { items?: UnitLike[] } };
    const copy = body.data?.items?.find((unit) =>
      unit.parentItemId === mutation.itemId && unit.isOpened === true && unit.deletedAt == null && sameInstant(unit.openedAt, openedAt));
    return copy ? { data: copy, changed: [server], removedIds: [] } : null;
  } catch {
    return null;
  }
}

/**
 * FEAT-108: puts what the server answered for `done` into every copy of the
 * units (D8: the unit written, the group a copy was taken from, a sub-record
 * absorbed), drops the provisional copy `done` showed, and lays again the
 * changes still waiting for those units over the server's version — two
 * "J'en ouvre une" on a ×6: the first answered, ×5 + its opened bottle, the
 * second still shows ×4 + its provisional copy. Also used with the server's
 * version of a unit in conflict: the change is no longer shown.
 */
async function applyServerWrite(queryClient: QueryClient, done: QueuedMutation, write: ServerWrite): Promise<void> {
  const waiting = (await getAllQueuedMutations()).filter((m) => m.id !== done.id && m.status !== 'conflict');
  const fresh = [write.data, ...write.changed].filter((unit): unit is UnitLike => Boolean(unit?.id));
  const freshIds = new Set(fresh.map((unit) => unit.id));
  const gone = new Set([...write.removedIds, provisionalIdOf(done.id)]);
  const again = waiting.filter((m) => freshIds.has(m.itemId));
  const change: UnitsChange = (units, owner) => {
    const list = units.filter((unit) => !gone.has(unit.id));
    for (const unit of fresh) {
      const index = list.findIndex((known) => known.id === unit.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...unit };
        continue;
      }
      // A new unit (the copy taken off the group, a write-off): in the flat
      // list with its group's description, on the card of its own wine.
      if (owner !== undefined && unit.productId !== owner) continue;
      const groupIndex = list.findIndex((known) => known.id === (unit.parentItemId ?? done.itemId));
      const base = owner === undefined && groupIndex >= 0 ? list[groupIndex] : {};
      list.splice(groupIndex >= 0 ? groupIndex + 1 : list.length, 0, { ...base, ...unit });
    }
    return again.length > 0 ? overlayChanges(list, again) : list;
  };
  await updateUnitCaches(queryClient, change);
  for (const unit of fresh) {
    queryClient.setQueryData<InventoryItem>(inventoryItemKey(unit.id), (old) => (old ? ({ ...old, ...unit } as InventoryItem) : old));
  }
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
 *
 * FEAT-108: the version carried over is that of the unit the change was
 * sent to — for a copy taken off a group, the GROUP (in `changed`), never
 * the copy created (`data`): every later change of the group is checked
 * against the group, and a change replayed once more is refused (409)
 * rather than taking one more copy. One replay at a time across the tabs
 * ({@link SYNC_LOCK_NAME}).
 */
export async function flushQueue(queryClient: QueryClient): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks && typeof locks.request === 'function') {
      await locks.request(SYNC_LOCK_NAME, () => replayQueue(queryClient));
    } else {
      await replayQueue(queryClient);
    }
  } finally {
    isFlushing = false;
  }
}

async function replayQueue(queryClient: QueryClient): Promise<void> {
  let anySynced = false;
  try {
    const queued = await getAllQueuedMutations();
    // A mutation can be left in `syncing` if the tab closed or the network
    // dropped mid-request (the previous flush never got to record success,
    // conflict or failure). Only one flush ever runs at a time (the lock
    // shared by the tabs, `isFlushing` without it), so a `syncing` row here
    // is always stale — reset it to `pending` so the queue self-heals
    // instead of leaving it, and everything queued after it, stuck forever.
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

      // Re-read and taken for sending in one step: an earlier success in
      // this replay may have moved the expected version forward (see
      // `rebaseLaterMutations`), and the member may have dropped it
      // meanwhile ("Annuler") — then nothing is sent.
      const current = await claimQueuedMutation(mutation.id);
      if (!current) continue;
      notifyListeners();
      const outcome = await sendChange(current);

      // Review of #823: an opening refused because the server already has
      // it (sent, its answer lost) is that very opening — found by its own
      // opening time — never shown as a conflict to "keep" a second time.
      const already = outcome.kind === 'conflict' ? await alreadyApplied(current, outcome.serverItem) : null;
      if (outcome.kind === 'success' || already) {
        const write = outcome.kind === 'success' ? outcome.write : (already as ServerWrite);
        await deleteQueuedMutation(mutation.id);
        anySynced = true;
        const target = [write.data, ...write.changed].find((unit) => unit?.id === current.itemId);
        if (typeof target?.updatedAt === 'string') await rebaseLaterMutations(current, target.updatedAt);
        await applyServerWrite(queryClient, current, write);
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
        // Not applied: the screen shows the server's version until the member decides.
        await applyServerWrite(queryClient, current, {
          data: outcome.serverItem as unknown as UnitLike, changed: [], removedIds: [],
        });
        blockedItemIds.add(mutation.itemId);
      } else {
        await markMutation(mutation.id, {
          status: 'failed', errorReason: outcome.message, ...(outcome.code ? { errorCode: outcome.code } : {}),
        });
        blockedItemIds.add(mutation.itemId);
      }
    }
    if (mustRetry) scheduleRetry(queryClient);
    else cancelSyncRetry();
  } finally {
    // Refetch only when something reached the server; the refetched list
    // keeps the changes still queued on top (`overlayQueuedChanges`).
    if (anySynced) void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  }
}

/**
 * #585: after a change of `done.itemId` went through, the later queued
 * changes of the same item now expect the version the server just returned
 * (they were made on the device on top of that change).
 */
async function rebaseLaterMutations(done: QueuedMutation, newUpdatedAt: string): Promise<void> {
  const later = (await getAllQueuedMutations()).filter(
    (m) => m.itemId === done.itemId && m.id !== done.id && m.createdAt >= done.createdAt,
  );
  for (const listed of later) {
    // Read again right before writing: the member may have discarded it
    // meanwhile, and writing it back would revive it.
    const m = await getQueuedMutation(listed.id);
    if (!m) continue;
    // A conflict keeps the version it was compared with: the user decides.
    if (m.status !== 'conflict') await putQueuedMutation({ ...m, expectedUpdatedAt: newUpdatedAt });
  }
}

/**
 * Conflict resolution actions (used by `ConflictResolutionModal`).
 *  - `keepLocal`: re-queue the same change, but overwrite the
 *    `expectedUpdatedAt` with the server's current value so the next flush
 *    applies it to the unit as it is now (the user explicitly chose to) —
 *    FEAT-108: an action on a group then takes ONE copy off the group as
 *    it is now, never one more.
 *  - `keepServer`: drop the local mutation entirely and let the normal
 *    inventory refetch pull in the server's version.
 */
export async function resolveConflictKeepLocal(mutationId: string, queryClient: QueryClient): Promise<void> {
  const mutation = await getQueuedMutation(mutationId);
  if (!mutation || !mutation.conflictServerItem) return;
  const requeued: QueuedMutation = {
    ...mutation,
    status: 'pending',
    expectedUpdatedAt: mutation.conflictServerItem.updatedAt,
    conflictServerItem: undefined,
  };
  await putQueuedMutation(requeued);
  // Shown again, on the server's version, while it waits.
  await updateUnitCaches(queryClient, (units) => applyChange(units, requeued));
  notifyListeners();
  await flushQueue(queryClient);
}

export async function resolveConflictKeepServer(mutationId: string, queryClient: QueryClient): Promise<void> {
  await deleteQueuedMutation(mutationId);
  // The screen already shows the server's version (put there when the conflict came back).
  void queryClient.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
  notifyListeners();
}

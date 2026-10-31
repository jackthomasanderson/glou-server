'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryClient } from '@/lib/inventory/client';
import { InventoryItem } from '@/lib/inventory/types';
import { mirrorInventoryToCache, getCachedInventory } from '@/lib/offline/db';
import { enqueueMutation, overlayQueuedChanges } from '@/lib/offline/syncEngine';
import { notifyError, notifySuccess } from '@/lib/toast';
import { SIDEBAR_COUNTS_KEY } from '@/hooks/useSidebarCounts';
import { PRODUCTS_KEY, productDetailKey } from '@/hooks/useProducts';
import { detailWithUnitWrite, flatWithUnitChanges, withFlatItem, withoutUnit, withUnitChanges } from '@/lib/products/fromFlat';
import type { Product, ProductDetailView } from '@/lib/products/types';
import { TASTINGS_ON_ITEM } from '@shared/product';

export const INVENTORY_KEY = ['inventory'];
// #475: whether the last loaded list hit the server's 2,000-item cap.
const INVENTORY_TRUNCATED_KEY = ['inventory-meta', 'truncated'];
const TRASH_KEY = ['inventory', 'trash'];

/**
 * ISSUE_381: React Query hands `useEffect` a new array reference on every
 * render where the query re-runs, even when the server returned the exact
 * same rows (e.g. a background refetch after an unrelated mutation's
 * `invalidateQueries`). Without this, that new reference alone was enough
 * to trigger a full IndexedDB `clear()` + re-`put()` of up to 2,000 items.
 * Item count + the most recent `updatedAt` is enough to tell "nothing
 * changed" apart from "something changed" without a deep comparison.
 */
function inventoryFingerprint(items: InventoryItem[]): string {
  let maxUpdatedAt = '';
  for (const item of items) {
    if (item.updatedAt > maxUpdatedAt) maxUpdatedAt = item.updatedAt;
  }
  return `${items.length}:${maxUpdatedAt}`;
}

// ─── Read hooks ──────────────────────────────────────────────────────────────

/**
 * FEAT-16/23 offline-first: on top of the normal React Query fetch, this
 * hook (a) mirrors every successful list into the `inventory_cache`
 * IndexedDB store so it can be browsed offline, and (b) falls back to that
 * mirrored snapshot when the network request itself fails. Scope reminder:
 * this covers inventory CONSULTATION only — see the "bornage volontaire"
 * note in web/lib/offline/db.ts.
 */
/** #475: true when the list only holds the 2,000 most recent items. */
export function useInventoryTruncated(): boolean {
  const { data } = useQuery<boolean>({
    queryKey: INVENTORY_TRUNCATED_KEY,
    queryFn: () => false,
    enabled: false,
    staleTime: Infinity,
  });
  return data === true;
}

export function useInventory(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery<InventoryItem[]>({
    queryKey: INVENTORY_KEY,
    queryFn: async () => {
      try {
        const { items, truncated } = await inventoryClient.listWithMeta();
        queryClient.setQueryData(INVENTORY_TRUNCATED_KEY, truncated);
        // #585: changes still waiting in the offline queue stay on screen.
        return await overlayQueuedChanges(items);
      } catch (error) {
        // Offline fallback: serve the last mirrored snapshot instead of an
        // error/blank state. Only re-throw (surfacing the real error) if we
        // have nothing cached to fall back to.
        const cached = await getCachedInventory();
        if (cached.length > 0) return cached;
        throw error;
      }
    },
    staleTime: 1000 * 30,
    enabled: options?.enabled ?? true,
  });

  const lastMirroredFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (query.data) {
      const fingerprint = inventoryFingerprint(query.data);
      if (fingerprint === lastMirroredFingerprint.current) return;
      lastMirroredFingerprint.current = fingerprint;
      // Fire-and-forget: IndexedDB being unavailable (e.g. Safari private
      // browsing) must never block the online UI, it only means offline
      // browsing won't work for this session.
      void mirrorInventoryToCache(query.data).catch(() => undefined);
    }
  }, [query.data]);

  return query;
}

export function useInventoryTrash() {
  return useQuery<InventoryItem[]>({
    queryKey: TRASH_KEY,
    queryFn: inventoryClient.listTrash,
    staleTime: 1000 * 60,
  });
}

export function useInventoryItem(id: string) {
  return useQuery<InventoryItem>({
    queryKey: ['inventory', id],
    queryFn: () => inventoryClient.get(id),
    enabled: !!id,
  });
}

/**
 * Latest known state of one item: from the loaded list, else from its own
 * cache entry (filled by the item sheet), else from the server. Resolves
 * undefined when it cannot be had. The list can miss an item: capped at
 * 2,000 rows (#475), not loaded yet, or failed.
 */
export function useInventoryItemLookup() {
  const queryClient = useQueryClient();
  return useCallback(
    async (id: string): Promise<InventoryItem | undefined> => {
      const known =
        queryClient.getQueryData<InventoryItem[]>(INVENTORY_KEY)?.find((item) => item.id === id) ??
        queryClient.getQueryData<InventoryItem>(['inventory', id]);
      if (known) return known;
      try {
        return await queryClient.fetchQuery({ queryKey: ['inventory', id], queryFn: () => inventoryClient.get(id) });
      } catch {
        return undefined;
      }
    },
    [queryClient],
  );
}

// ─── Mutation: Create ────────────────────────────────────────────────────────

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, Partial<InventoryItem> & { confirmDuplicate?: boolean }>({
    mutationFn: inventoryClient.create,
    onSuccess: (newItem) => {
      queryClient.setQueryData<InventoryItem[]>(INVENTORY_KEY, (old) =>
        old ? [...old, newItem] : [newItem]
      );
      notifySuccess('toast.createSuccess');
    },
    onError: (error) => {
      // DUPLICATE_CANDIDATE is not a failure: the caller turns it into the
      // duplicate-resolution dialog.
      if (error.message === 'DUPLICATE_CANDIDATE') return;
      // #683: say when the server refused a value, so the user can tell a
      // form problem from a connection problem.
      notifyError(error.message === 'VALIDATION_ERROR' ? 'toast.createRejected' : 'toast.createError');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Update ────────────────────────────────────────────────────────

/**
 * `expectedUpdatedAt` (the edit form, #572): the version the change was made
 * from. A change made meanwhile by someone else is then refused (409
 * `CONFLICT`) instead of overwritten.
 */
export interface UpdateInventoryItemVariables {
  id: string;
  patch: Partial<InventoryItem>;
  expectedUpdatedAt?: string;
}

const REATTACH_REFUSALS: Record<string, string> = {
  [TASTINGS_ON_ITEM]: 'toast.tastingsOnBottle',
  FIELDS_WITH_REATTACH: 'toast.fieldsWithReattach',
};

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, UpdateInventoryItemVariables>({
    mutationFn: async ({ id, patch, expectedUpdatedAt }: UpdateInventoryItemVariables) => {
      try {
        const write = await inventoryClient.update(id, patch, expectedUpdatedAt);
        // D8 (#471): opening one bottle of a group creates a sub-record
        // (`data`) and decrements the group (`changed`); a reattachment
        // removes the sub-record (`removedIds`). Every cache follows.
        queryClient.setQueryData<InventoryItem[]>(INVENTORY_KEY, (old) =>
          flatWithUnitChanges(old, write.changed, write.removedIds));
        queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) =>
          withUnitChanges(old, write.changed, write.removedIds));
        for (const removedId of write.removedIds) queryClient.removeQueries({ queryKey: ['inventory', removedId], exact: true });
        // The wine's drawer, if open: the bottle written itself follows in onSuccess.
        if (write.data.productId) {
          queryClient.setQueryData<ProductDetailView>(productDetailKey(write.data.productId), (old) =>
            detailWithUnitWrite(old, null, write.changed, write.removedIds));
        }
        return write.data;
      } catch (error) {
        // FEAT-16/23 offline resilience: `fetch` throws a `TypeError` only
        // when the request never reached the network at all (no
        // connectivity, DNS failure...) — a real server-side outcome
        // (validation error, 404, 409 conflict, 500) means `fetch` DID get a
        // Response, so `lib/api.ts`'s `client.patch` throws a plain `Error`
        // there instead, and that case is re-thrown untouched below so
        // callers keep seeing genuine failures.
        if (!(error instanceof TypeError)) throw error;

        const cachedList = queryClient.getQueryData<InventoryItem[]>(INVENTORY_KEY);
        const cachedItem =
          cachedList?.find((item) => item.id === id) ??
          queryClient.getQueryData<InventoryItem>(['inventory', id]);
        // No known `updatedAt` to anchor the conflict check on (item never
        // loaded in this session) — nothing sensible to queue.
        if (!cachedItem) throw error;

        await enqueueMutation(queryClient, id, patch, expectedUpdatedAt ?? cachedItem.updatedAt);
        // Optimistic UI: resolve successfully with the merged local state
        // instead of surfacing an error — the mutation is safely queued and
        // `ConnectivityIndicator` reflects the pending count.
        return { ...cachedItem, ...patch } as InventoryItem;
      }
    },
    onSuccess: (updatedItem) => {
      // ISSUE_381: the server/offline-queue result already has the item's
      // final state — merge it into both caches in place instead of
      // invalidating the whole list, which would re-fetch up to 2,000 items
      // and re-trigger a full IndexedDB mirror rewrite for a one-field edit.
      // A sub-record just detached is a new row.
      queryClient.setQueryData<InventoryItem[]>(INVENTORY_KEY, (old) =>
        old && !old.some((item) => item.id === updatedItem.id)
          ? [...old, updatedItem]
          : old?.map((item) => (item.id === updatedItem.id ? updatedItem : item))
      );
      queryClient.setQueryData<InventoryItem>(['inventory', updatedItem.id], updatedItem);
      // #471: the wine's card sums its bottles: update it in place too.
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => withFlatItem(old, updatedItem));
      if (updatedItem.productId) {
        queryClient.setQueryData<ProductDetailView>(productDetailKey(updatedItem.productId), (old) =>
          detailWithUnitWrite(old, updatedItem));
      }
    },
    onError: (error) => {
      // #471 (K): putting a bottle back full refuses to lose its tastings
      // unasked (409), or another field written with it (400).
      if (error.message in REATTACH_REFUSALS) {
        notifyError(REATTACH_REFUSALS[error.message]);
        return;
      }
      if (error.message !== 'CONFLICT') {
        notifyError('toast.updateError');
        return;
      }
      // #572: changed meanwhile. Nothing was written; fetch the current
      // version so the bottle opens with it next time.
      notifyError('toast.updateConflict');
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      // The sidebar badges (useSidebarCounts) normally piggyback on an
      // INVENTORY_KEY invalidation, which this mutation no longer does.
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}

// ─── Mutation: Rollback field (FEAT-05) ─────────────────────────────────────

export function useRollbackField() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, { id: string; field: string; toValue: unknown }>({
    mutationFn: ({ id, field, toValue }) => inventoryClient.rollbackField(id, field, toValue),
    onSuccess: (_updatedItem, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', variables.id, 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory', variables.id] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

// ─── Mutation: Bulk Update ───────────────────────────────────────────────────

export function useBulkUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<{ updatedCount: number }, Error, { ids: string[]; patch: Partial<InventoryItem> }>({
    mutationFn: ({ ids, patch }) => inventoryClient.bulkUpdate(ids, patch),
    onError: () => notifyError('toast.bulkUpdateError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Delete (soft) ─────────────────────────────────────────────────

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, string>({
    mutationFn: inventoryClient.delete,
    onSuccess: (_deletedItem, id) => {
      // ISSUE_381: drop the one row instead of invalidating the whole list.
      queryClient.setQueryData<InventoryItem[]>(INVENTORY_KEY, (old) =>
        old?.filter((item) => item.id !== id)
      );
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => withoutUnit(old, id));
    },
    onError: () => notifyError('toast.deleteError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      // See useUpdateInventoryItem: the sidebar badges piggyback on an
      // INVENTORY_KEY invalidation that this mutation no longer does.
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}

// ─── Mutation: Restore ───────────────────────────────────────────────────────

export function useRestoreInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, string>({
    mutationFn: inventoryClient.restore,
    onSuccess: () => notifySuccess('toast.restoreSuccess'),
    onError: () => notifyError('toast.restoreError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

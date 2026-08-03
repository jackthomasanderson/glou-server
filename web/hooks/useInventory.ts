'use client';
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryClient } from '@/lib/inventory/client';
import { InventoryItem, InventoryHistoryEntry } from '@/lib/inventory/types';
import { mirrorInventoryToCache, getCachedInventory } from '@/lib/offline/db';
import { enqueueMutation } from '@/lib/offline/syncEngine';

export const INVENTORY_KEY = ['inventory'];
const TRASH_KEY = ['inventory', 'trash'];

// ─── Read hooks ──────────────────────────────────────────────────────────────

/**
 * FEAT-16/23 offline-first: on top of the normal React Query fetch, this
 * hook (a) mirrors every successful list into the `inventory_cache`
 * IndexedDB store so it can be browsed offline, and (b) falls back to that
 * mirrored snapshot when the network request itself fails. Scope reminder:
 * this covers inventory CONSULTATION only — see the "bornage volontaire"
 * note in web/lib/offline/db.ts.
 */
export function useInventory() {
  const query = useQuery<InventoryItem[]>({
    queryKey: INVENTORY_KEY,
    queryFn: async () => {
      try {
        return await inventoryClient.list();
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
  });

  useEffect(() => {
    if (query.data) {
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

export function useInventoryItemHistory(id: string, enabled: boolean) {
  return useQuery<InventoryHistoryEntry[]>({
    queryKey: ['inventory', id, 'history'],
    queryFn: () => inventoryClient.getHistory(id),
    enabled: !!id && enabled,
    staleTime: 1000 * 60,
  });
}

// ─── Mutation: Create ────────────────────────────────────────────────────────

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, Partial<InventoryItem>>({
    mutationFn: inventoryClient.create,
    onSuccess: (newItem) => {
      queryClient.setQueryData<InventoryItem[]>(INVENTORY_KEY, (old) =>
        old ? [...old, newItem] : [newItem]
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Update ────────────────────────────────────────────────────────

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, { id: string; patch: Partial<InventoryItem> }>({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<InventoryItem> }) => {
      try {
        return await inventoryClient.update(id, patch);
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

        await enqueueMutation(queryClient, id, patch, cachedItem.updatedAt);
        // Optimistic UI: resolve successfully with the merged local state
        // instead of surfacing an error — the mutation is safely queued and
        // `ConnectivityIndicator` reflects the pending count.
        return { ...cachedItem, ...patch } as InventoryItem;
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Restore ───────────────────────────────────────────────────────

export function useRestoreInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation<InventoryItem, Error, string>({
    mutationFn: inventoryClient.restore,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

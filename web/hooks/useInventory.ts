'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryClient } from '@/lib/inventory/client';
import { InventoryItem, InventoryHistoryEntry } from '@/lib/inventory/types';

export const INVENTORY_KEY = ['inventory'];
const TRASH_KEY = ['inventory', 'trash'];

// ─── Read hooks ──────────────────────────────────────────────────────────────

export function useInventory() {
  return useQuery<InventoryItem[]>({
    queryKey: INVENTORY_KEY,
    queryFn: inventoryClient.list,
    staleTime: 1000 * 30,
  });
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
    mutationFn: ({ id, patch }: { id: string; patch: Partial<InventoryItem> }) => inventoryClient.update(id, patch),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
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

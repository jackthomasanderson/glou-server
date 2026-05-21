'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bottleClient } from '@/lib/bottles/client';
import { Bottle, BottleHistoryEntry } from '@/lib/bottles/types';

const BOTTLES_KEY = ['bottles'];
const TRASH_KEY = ['bottles', 'trash'];

// ─── Read hooks ──────────────────────────────────────────────────────────────

export function useBottles() {
  return useQuery<Bottle[]>({
    queryKey: BOTTLES_KEY,
    queryFn: bottleClient.list,
    staleTime: 1000 * 30,
  });
}

export function useTrash() {
  return useQuery<Bottle[]>({
    queryKey: TRASH_KEY,
    queryFn: bottleClient.listTrash,
    staleTime: 1000 * 60,
  });
}

export function useBottle(id: string) {
  return useQuery<Bottle>({
    queryKey: ['bottles', id],
    queryFn: () => bottleClient.get(id),
    enabled: !!id,
  });
}

export function useBottleHistory(id: string, enabled: boolean) {
  return useQuery<BottleHistoryEntry[]>({
    queryKey: ['bottles', id, 'history'],
    queryFn: () => bottleClient.getHistory(id),
    enabled: !!id && enabled,
    staleTime: 1000 * 60,
  });
}

// ─── Mutation: Create ────────────────────────────────────────────────────────

export function useCreateBottle() {
  const queryClient = useQueryClient();
  return useMutation<Bottle, Error, Partial<Bottle>>({
    mutationFn: bottleClient.create,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOTTLES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Update ────────────────────────────────────────────────────────

export function useUpdateBottle() {
  const queryClient = useQueryClient();
  return useMutation<Bottle, Error, { id: string; patch: Partial<Bottle> }>({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Bottle> }) => bottleClient.update(id, patch),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOTTLES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Bulk Update ───────────────────────────────────────────────────

export function useBulkUpdateBottle() {
  const queryClient = useQueryClient();
  return useMutation<{ updatedCount: number }, Error, { ids: string[]; patch: Partial<Bottle> }>({
    mutationFn: ({ ids, patch }) => bottleClient.bulkUpdate(ids, patch),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOTTLES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Delete (soft) ─────────────────────────────────────────────────

export function useDeleteBottle() {
  const queryClient = useQueryClient();
  return useMutation<Bottle, Error, string>({
    mutationFn: bottleClient.delete,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOTTLES_KEY });
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

// ─── Mutation: Restore ───────────────────────────────────────────────────────

export function useRestoreBottle() {
  const queryClient = useQueryClient();
  return useMutation<Bottle, Error, string>({
    mutationFn: bottleClient.restore,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOTTLES_KEY });
      void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkPresetClient } from '@/lib/bulk-presets/client';
import { InventoryItem } from '@/lib/inventory/types';
import { notifyError } from '@/lib/toast';
import { qk } from '@/lib/queryKeys';

export function useBulkPresets() {
  return useQuery({
    queryKey: qk.bulkPresets,
    queryFn: () => bulkPresetClient.list(),
  });
}

export function useCreateBulkPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Partial<InventoryItem> }) =>
      bulkPresetClient.create(name, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bulkPresets });
    },
  });
}

export function useDeleteBulkPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { handlesError: true },
    mutationFn: (id: string) => bulkPresetClient.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bulkPresets });
    },
    // The confirmation closes right away: a failure must still be said.
    onError: () => notifyError('toast.bulkPreset.deleteError'),
  });
}

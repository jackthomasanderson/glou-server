import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkPresetClient } from '@/lib/bulk-presets/client';
import { InventoryItem } from '@/lib/inventory/types';

export function useBulkPresets() {
  return useQuery({
    queryKey: ['bulk-presets'],
    queryFn: () => bulkPresetClient.list(),
  });
}

export function useCreateBulkPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Partial<InventoryItem> }) =>
      bulkPresetClient.create(name, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulk-presets'] });
    },
  });
}

export function useDeleteBulkPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bulkPresetClient.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulk-presets'] });
    },
  });
}

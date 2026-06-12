'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storageZoneClient } from '@/lib/storage-zones/client';
import { StorageZone, CreateStorageZoneInput, UpdateStorageZoneInput } from '@/lib/storage-zones/types';

export function useStorageZones(cellarId: string) {
  return useQuery<StorageZone[]>({
    queryKey: ['storage-zones', cellarId],
    queryFn: () => storageZoneClient.listByCellar(cellarId),
    enabled: !!cellarId,
  });
}

export function useCreateStorageZone(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<StorageZone, Error, CreateStorageZoneInput>({
    mutationFn: (input) => storageZoneClient.create(cellarId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-zones', cellarId] });
    },
  });
}

export function useUpdateStorageZone(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<StorageZone, Error, { id: string; data: UpdateStorageZoneInput }>({
    mutationFn: ({ id, data }) => storageZoneClient.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-zones', cellarId] });
    },
  });
}

export function useDeleteStorageZone(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => storageZoneClient.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-zones', cellarId] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

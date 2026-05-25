import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';

import { Cellar, CellarGridData, CreateCellarInput, UpdateCellarInput } from '@/lib/cellars/types';

/**
 * Hook to fetch all cellars for the current user
 */
export function useCellars() {
  return useQuery<Cellar[]>({
    queryKey: ['cellars'],
    queryFn: async () => {
      const { data } = await client.get<Cellar[]>('/cellars');
      return data;
    },
  });
}

/**
 * Hook to fetch a single cellar by ID
 */
export function useCellar(id: string) {
  return useQuery<Cellar>({
    queryKey: ['cellars', id],
    queryFn: async () => {
      const { data } = await client.get<Cellar>(`/cellars/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch grid data for a cellar (config + all items with slot assignments)
 */
export function useCellarGrid(cellarId: string) {
  return useQuery<CellarGridData>({
    queryKey: ['cellars', cellarId, 'grid'],
    queryFn: async () => {
      const { data } = await client.get<CellarGridData>(`/cellars/${cellarId}/grid`);
      return data;
    },
    enabled: !!cellarId,
  });
}

/**
 * Hook to create a new cellar
 */
export function useCreateCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCellarInput) => {
      const response = await client.post<Cellar>('/cellars', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

/**
 * Hook to update a cellar
 */
export function useUpdateCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCellarInput }) => {
      const response = await client.patch<Cellar>(`/cellars/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

/**
 * Hook to delete a cellar
 */
export function useDeleteCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete<void>(`/cellars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

/**
 * Hook to assign (or clear) a grid slot for an inventory item.
 * Passing null for slotColumn/slotRow removes the slot assignment.
 * Throws an Error with message 'SLOT_OCCUPIED' when the target cell is already taken.
 */
export function useAssignSlot(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { itemId: string; slotColumn: number | null; slotRow: number | null }
  >({
    mutationFn: async ({ itemId, slotColumn, slotRow }) => {
      await client.patch(`/inventory/${itemId}`, { slotColumn, slotRow });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars', cellarId, 'grid'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

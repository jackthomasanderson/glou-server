import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';
import { notifyError, notifySuccess } from '@/lib/toast';

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
      notifySuccess('toast.cellar.createSuccess');
    },
    onError: () => notifyError('toast.cellar.createError'),
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
      notifySuccess('toast.cellar.updateSuccess');
    },
    onError: () => notifyError('toast.cellar.updateError'),
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
      notifySuccess('toast.cellar.deleteSuccess');
    },
    onError: () => notifyError('toast.cellar.deleteError'),
  });
}

/**
 * FEAT-93: places one more copy of a line in a cell of the plan
 * (POST /api/inventory/:id/slots). Throws an Error with message
 * 'SLOT_OCCUPIED' when the cell is taken, 'NO_UNPLACED_COPY' when every copy
 * of the line is already placed.
 */
export function useAssignSlot(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { itemId: string; column: number; row: number }>({
    mutationFn: async ({ itemId, column, row }) => {
      await client.post(`/inventory/${itemId}/slots`, { column, row });
    },
    // A refusal too: the plan was out of date (a cell or a copy taken from another device).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars', cellarId, 'grid'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/** FEAT-93: takes a copy out of its cell (DELETE /api/slots/:slotId); it stays in stock, unplaced. */
export function useRemoveSlot(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { slotId: string }>({
    mutationFn: async ({ slotId }) => {
      await client.delete(`/slots/${slotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars', cellarId, 'grid'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

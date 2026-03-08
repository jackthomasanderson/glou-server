import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';

import { Cellar, CreateCellarInput, UpdateCellarInput } from '@/lib/cellars/types';

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

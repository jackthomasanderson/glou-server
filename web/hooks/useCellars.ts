import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../lib/bottles/client';

export interface Cellar {
  id: string;
  name: string;
  description: string | null;
  type: 'VINTAGE' | 'COOLER' | 'SHELF';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCellarInput {
  name: string;
  description?: string | null;
  type: 'VINTAGE' | 'COOLER' | 'SHELF';
}

/**
 * Hook to fetch all cellars for the current user
 */
export function useCellars() {
  return useQuery<Cellar[]>({
    queryKey: ['cellars'],
    queryFn: async () => {
      const response = await client.get('/cellars');
      return response.data;
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
      const response = await client.post('/cellars', data);
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateCellarInput> }) => {
      const response = await client.patch(`/cellars/${id}`, data);
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
      await client.delete(`/cellars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
  });
}

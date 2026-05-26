'use client';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { tastingsClient } from '@/lib/tastings/client';
import { TastingNote, TastingFormValues, TastingListResult } from '@/lib/tastings/types';

export const TASTINGS_KEY = ['tastings'];

export function useTastings(page = 1, limit = 20, itemId?: string) {
  return useQuery<TastingListResult>({
    queryKey: [...TASTINGS_KEY, { page, limit, itemId }],
    queryFn: () => tastingsClient.list(page, limit, itemId),
    staleTime: 1000 * 30,
  });
}

export function useCreateTasting() {
  const queryClient = useQueryClient();
  return useMutation<TastingNote, Error, TastingFormValues>({
    mutationFn: tastingsClient.create,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: TASTINGS_KEY }),
  });
}

export function useUpdateTasting() {
  const queryClient = useQueryClient();
  return useMutation<TastingNote, Error, { id: string; data: Partial<TastingFormValues> }>({
    mutationFn: ({ id, data }) => tastingsClient.update(id, data),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: TASTINGS_KEY }),
  });
}

export function useDeleteTasting() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: tastingsClient.delete,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: TASTINGS_KEY }),
  });
}

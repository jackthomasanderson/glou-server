'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tastingsClient } from '@/lib/tastings/client';
import { TastingNote, TastingFormValues, TastingListResult, TastingItemStats, TastingAnalytics } from '@/lib/tastings/types';

export const TASTINGS_KEY = ['tastings'];

export function useTastings(page = 1, limit = 20, itemId?: string, search?: string) {
  return useQuery<TastingListResult>({
    queryKey: [...TASTINGS_KEY, { page, limit, itemId, search }],
    queryFn: () => tastingsClient.list(page, limit, itemId, search),
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

export function useTastingItemStats(itemId: string | undefined) {
  return useQuery<TastingItemStats | null>({
    queryKey: [...TASTINGS_KEY, 'stats', itemId],
    queryFn: () => tastingsClient.itemStats(itemId!),
    enabled: !!itemId,
    staleTime: 1000 * 30,
  });
}

export function useTastingAnalytics() {
  return useQuery<TastingAnalytics>({
    queryKey: [...TASTINGS_KEY, 'analytics'],
    queryFn: () => tastingsClient.analytics(),
    staleTime: 1000 * 60,
  });
}

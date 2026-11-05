'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tastingsClient } from '@/lib/tastings/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import { PRODUCTS_KEY } from '@/hooks/useProducts';
import { TastingNote, TastingFormValues, TastingListResult, TastingAnalytics } from '@/lib/tastings/types';

export const TASTINGS_KEY = ['tastings'];

/**
 * #471 (FEAT-107): a tasting changes its wine's drawer (its tastings), the
 * list of wines (a "Plus en cave" card's last activity, a wine tasted
 * elsewhere added without any bottle) and the journal.
 */
function refreshAfterTasting(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: TASTINGS_KEY });
  void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY, exact: true });
  void queryClient.invalidateQueries({ queryKey: ['inventory', 'product'] });
}

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
    onSuccess: () => notifySuccess('toast.tasting.createSuccess'),
    onError: () => notifyError('toast.tasting.createError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useUpdateTasting() {
  const queryClient = useQueryClient();
  return useMutation<TastingNote, Error, { id: string; data: Partial<TastingFormValues> }>({
    mutationFn: ({ id, data }) => tastingsClient.update(id, data),
    onSuccess: () => notifySuccess('toast.tasting.updateSuccess'),
    onError: () => notifyError('toast.tasting.updateError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useDeleteTasting() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: tastingsClient.delete,
    onSuccess: () => notifySuccess('toast.tasting.deleteSuccess'),
    onError: () => notifyError('toast.tasting.deleteError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useTastingAnalytics() {
  return useQuery<TastingAnalytics>({
    queryKey: [...TASTINGS_KEY, 'analytics'],
    queryFn: () => tastingsClient.analytics(),
    staleTime: 1000 * 60,
  });
}

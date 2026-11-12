'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tastingsClient } from '@/lib/tastings/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import { qk } from '@/lib/queryKeys';
import { TastingNote, TastingFormValues, TastingListResult, TastingAnalytics } from '@/lib/tastings/types';

/**
 * #471 (FEAT-107): a tasting changes its wine's drawer (its tastings), the
 * list of wines (a "Plus en cave" card's last activity, a wine tasted
 * elsewhere added without any bottle) and the journal.
 */
function refreshAfterTasting(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: qk.tastings.all });
  void queryClient.invalidateQueries({ queryKey: qk.products.list, exact: true });
  void queryClient.invalidateQueries({ queryKey: qk.products.details });
}

export function useTastings(page = 1, limit = 20, itemId?: string, search?: string) {
  return useQuery<TastingListResult>({
    queryKey: qk.tastings.list({ page, limit, itemId, search }),
    queryFn: () => tastingsClient.list(page, limit, itemId, search),
    staleTime: 1000 * 30,
  });
}

export function useCreateTasting() {
  const queryClient = useQueryClient();
  return useMutation<TastingNote, Error, TastingFormValues>({
    meta: { handlesError: true },
    mutationFn: tastingsClient.create,
    onSuccess: () => notifySuccess('toast.tasting.createSuccess'),
    onError: () => notifyError('toast.tasting.createError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useUpdateTasting() {
  const queryClient = useQueryClient();
  return useMutation<TastingNote, Error, { id: string; data: Partial<TastingFormValues> }>({
    meta: { handlesError: true },
    mutationFn: ({ id, data }) => tastingsClient.update(id, data),
    onSuccess: () => notifySuccess('toast.tasting.updateSuccess'),
    onError: () => notifyError('toast.tasting.updateError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useDeleteTasting() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    meta: { handlesError: true },
    mutationFn: tastingsClient.delete,
    onSuccess: () => notifySuccess('toast.tasting.deleteSuccess'),
    onError: () => notifyError('toast.tasting.deleteError'),
    onSettled: () => refreshAfterTasting(queryClient),
  });
}

export function useTastingAnalytics() {
  return useQuery<TastingAnalytics>({
    queryKey: qk.tastings.analytics,
    queryFn: () => tastingsClient.analytics(),
    staleTime: 1000 * 60,
  });
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MergeRequest } from '@shared/review';
import { reviewClient, type MergeAnswer, type ReviewCases } from '@/lib/review/client';
import { NetworkError } from '@/lib/network-error';
import { notifyError } from '@/lib/toast';
import { SIDEBAR_COUNTS_KEY } from '@/hooks/useSidebarCounts';
import { productDetailKey } from '@/hooks/useProducts';
import type { ProductItem } from '@/lib/products/types';

/**
 * #471 (FEAT-102): what is left to review after the update. Under the
 * `inventory` prefix, so every change of the wines refreshes it too.
 */
export const REVIEW_KEY = ['inventory', 'review'];

/** The cases to review, shared by every member (a case settled by one disappears for all). */
export function useReviewCases(options?: { enabled?: boolean }) {
  return useQuery<ReviewCases>({
    queryKey: REVIEW_KEY,
    queryFn: reviewClient.list,
    staleTime: 1000 * 60,
    enabled: options?.enabled ?? true,
  });
}

/** Refusals of a review action said in words: the case changed meanwhile, the list is read again. */
const REFUSALS: Record<string, string> = {
  DISTINCT_WINES: 'review.errors.changed',
  PRODUCT_NOT_FOUND: 'review.errors.changed',
  PRODUCT_IN_TRASH: 'review.errors.changed',
  NOT_SAME_WINE: 'review.errors.changed',
  INVALID_CHOICE: 'review.errors.changed',
  ITEM_NOT_FOUND: 'review.errors.changed',
};

function notifyRefusal(error: Error) {
  // Decision #471 point 47 / ux-ui.md §10.8: merging waits for the network.
  if (error instanceof NetworkError) {
    notifyError('review.errors.offline');
    return;
  }
  notifyError(REFUSALS[error.message] ?? 'review.errors.failed');
}

/** Everything a review action may change: the list, the wines, the drawers, cellars and counters. */
function useRefreshAfterReview() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
  };
}

/** "Regrouper" (c2): definitive, no undo (ux-ui.md §10.7). */
export function useMergeFamilies() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterReview();
  return useMutation<MergeAnswer, Error, MergeRequest>({
    mutationFn: reviewClient.merge,
    onSuccess: (answer) => {
      queryClient.setQueryData<ReviewCases>(REVIEW_KEY, (old) => old && {
        ...old,
        merges: old.merges.filter((merge) => !merge.products.some((product) => answer.removedProductIds.includes(product.id))),
      });
      for (const id of answer.removedProductIds) queryClient.removeQueries({ queryKey: productDetailKey(id) });
    },
    onError: notifyRefusal,
    onSettled: refresh,
  });
}

/** "C'est un autre vin" (c3): remembered, never proposed again. */
export function useKeepApart() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterReview();
  return useMutation<void, Error, string[]>({
    mutationFn: reviewClient.keepApart,
    onSuccess: (_answer, productIds) => {
      queryClient.setQueryData<ReviewCases>(REVIEW_KEY, (old) => old && {
        ...old,
        merges: old.merges.filter((merge) => !merge.products.every((product) => productIds.includes(product.id))),
      });
    },
    onError: notifyRefusal,
    onSettled: refresh,
  });
}

/** "C'est bon" (c4): the number stays, the case disappears. */
export function useConfirmCount() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterReview();
  return useMutation<ProductItem, Error, string>({
    mutationFn: reviewClient.confirmCount,
    onSuccess: (_item, itemId) => {
      queryClient.setQueryData<ReviewCases>(REVIEW_KEY, (old) => old && {
        ...old,
        counts: old.counts.filter((count) => count.group.id !== itemId),
      });
    },
    onError: notifyRefusal,
    onSettled: refresh,
  });
}

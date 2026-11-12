'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistClient } from '@/lib/wishlist/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';
import {
  WishlistItem, WishlistCreateInput, WishlistPatchInput, ConvertToInventoryInput, ConvertResult,
} from '@/lib/wishlist/types';

const WISHLIST_KEY = qk.wishlist;

/** The wishlist and its badge in the menu (items at or under their ceiling price). */
function refreshWishlist(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
  void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
}

export function useWishlist() {
  return useQuery<WishlistItem[]>({
    queryKey: WISHLIST_KEY,
    queryFn: wishlistClient.list,
    staleTime: 1000 * 30,
  });
}

export function useCreateWishlistItem() {
  const queryClient = useQueryClient();
  return useMutation<WishlistItem, Error, WishlistCreateInput>({
    meta: { handlesError: true },
    mutationFn: wishlistClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<WishlistItem[]>(WISHLIST_KEY, (old) => (old ? [created, ...old] : [created]));
      notifySuccess('toast.wishlist.createSuccess');
    },
    onError: () => notifyError('toast.wishlist.createError'),
    onSettled: () => refreshWishlist(queryClient),
  });
}

export function useUpdateWishlistItem() {
  const queryClient = useQueryClient();
  return useMutation<WishlistItem, Error, { id: string; data: WishlistPatchInput }>({
    meta: { handlesError: true },
    mutationFn: ({ id, data }) => wishlistClient.update(id, data),
    onSuccess: () => notifySuccess('toast.wishlist.updateSuccess'),
    onError: () => notifyError('toast.wishlist.updateError'),
    onSettled: () => refreshWishlist(queryClient),
  });
}

export function useDeleteWishlistItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    meta: { handlesError: true },
    mutationFn: wishlistClient.delete,
    onSuccess: (_, id) => {
      queryClient.setQueryData<WishlistItem[]>(WISHLIST_KEY, (old) => (old ? old.filter((w) => w.id !== id) : []));
      notifySuccess('toast.wishlist.deleteSuccess');
    },
    onError: () => notifyError('toast.wishlist.deleteError'),
    onSettled: () => refreshWishlist(queryClient),
  });
}

export function useRecordPriceSeen() {
  const queryClient = useQueryClient();
  return useMutation<WishlistItem, Error, { id: string; price: number }>({
    meta: { handlesError: true },
    mutationFn: ({ id, price }) => wishlistClient.recordPriceSeen(id, price),
    onSuccess: () => notifySuccess('toast.wishlist.priceSuccess'),
    onError: () => notifyError('toast.wishlist.priceError'),
    onSettled: () => refreshWishlist(queryClient),
  });
}

export function useConvertToInventory() {
  const queryClient = useQueryClient();
  return useMutation<ConvertResult, Error, { id: string; data: ConvertToInventoryInput }>({
    meta: { handlesError: true },
    mutationFn: ({ id, data }) => wishlistClient.convertToInventory(id, data),
    onSuccess: () => notifySuccess('toast.wishlist.convertSuccess'),
    onError: () => notifyError('toast.wishlist.convertError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
      // #471: the bottles bought join the stock (list, cellar, counters, spending…).
      invalidateAfterInventoryChange(queryClient);
    },
  });
}

'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistClient } from '@/lib/wishlist/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import {
  WishlistItem, WishlistCreateInput, WishlistPatchInput, ConvertToInventoryInput, ConvertResult,
} from '@/lib/wishlist/types';

export const WISHLIST_KEY = ['wishlist'];

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
    mutationFn: wishlistClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<WishlistItem[]>(WISHLIST_KEY, (old) => (old ? [created, ...old] : [created]));
      notifySuccess('toast.wishlist.createSuccess');
    },
    onError: () => notifyError('toast.wishlist.createError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useUpdateWishlistItem() {
  const queryClient = useQueryClient();
  return useMutation<WishlistItem, Error, { id: string; data: WishlistPatchInput }>({
    mutationFn: ({ id, data }) => wishlistClient.update(id, data),
    onSuccess: () => notifySuccess('toast.wishlist.updateSuccess'),
    onError: () => notifyError('toast.wishlist.updateError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useDeleteWishlistItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: wishlistClient.delete,
    onSuccess: (_, id) => {
      queryClient.setQueryData<WishlistItem[]>(WISHLIST_KEY, (old) => (old ? old.filter((w) => w.id !== id) : []));
      notifySuccess('toast.wishlist.deleteSuccess');
    },
    onError: () => notifyError('toast.wishlist.deleteError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useRecordPriceSeen() {
  const queryClient = useQueryClient();
  return useMutation<WishlistItem, Error, { id: string; price: number }>({
    mutationFn: ({ id, price }) => wishlistClient.recordPriceSeen(id, price),
    onSuccess: () => notifySuccess('toast.wishlist.priceSuccess'),
    onError: () => notifyError('toast.wishlist.priceError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useConvertToInventory() {
  const queryClient = useQueryClient();
  return useMutation<ConvertResult, Error, { id: string; data: ConvertToInventoryInput }>({
    mutationFn: ({ id, data }) => wishlistClient.convertToInventory(id, data),
    onSuccess: () => notifySuccess('toast.wishlist.convertSuccess'),
    onError: () => notifyError('toast.wishlist.convertError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

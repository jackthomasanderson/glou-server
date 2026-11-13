'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsClient } from '@/lib/collections/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import { Collection, CollectionFormValues } from '@/lib/collections/types';
import { qk } from '@/lib/queryKeys';

const COLLECTIONS_KEY = qk.collections;

/** The collections and their badge in the menu. */
function refreshCollections(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
  void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
}

export function useCollections() {
  return useQuery<Collection[]>({
    queryKey: COLLECTIONS_KEY,
    queryFn: collectionsClient.list,
    staleTime: 1000 * 30,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, CollectionFormValues>({
    meta: { handlesError: true },
    mutationFn: collectionsClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<Collection[]>(COLLECTIONS_KEY, (old) =>
        old ? [...old, created] : [created]
      );
      notifySuccess('toast.collection.createSuccess');
    },
    onError: () => notifyError('toast.collection.createError'),
    onSettled: () => refreshCollections(queryClient),
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; data: Partial<CollectionFormValues> }>({
    meta: { handlesError: true },
    mutationFn: ({ id, data }) => collectionsClient.update(id, data),
    onSuccess: () => notifySuccess('toast.collection.updateSuccess'),
    onError: () => notifyError('toast.collection.updateError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    meta: { handlesError: true },
    mutationFn: collectionsClient.delete,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Collection[]>(COLLECTIONS_KEY, (old) =>
        old ? old.filter((c) => c.id !== id) : []
      );
      notifySuccess('toast.collection.deleteSuccess');
    },
    onError: () => notifyError('toast.collection.deleteError'),
    onSettled: () => {
      refreshCollections(queryClient);
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

// Adding to and removing from a collection raise no toast themselves: a save
// runs several in parallel, and its caller reports a failure once.
export function useAddItemsToCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; itemIds: string[] }>({
    // Said by applyCollectionChanges.
    meta: { handlesError: true },
    mutationFn: ({ id, itemIds }) => collectionsClient.addItems(id, itemIds),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

export function useRemoveItemFromCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; itemId: string }>({
    // Said by applyCollectionChanges.
    meta: { handlesError: true },
    mutationFn: ({ id, itemId }) => collectionsClient.removeItem(id, itemId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

/** #471: a wine (and so all its bottles) joins a collection. */
export function useAddProductsToCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; productIds: string[] }>({
    // Said by applyCollectionChanges or CollectionPickerInline.
    meta: { handlesError: true },
    mutationFn: ({ id, productIds }) => collectionsClient.addProducts(id, productIds),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

export function useRemoveProductFromCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; productId: string }>({
    // Said by applyCollectionChanges or CollectionPickerInline.
    meta: { handlesError: true },
    mutationFn: ({ id, productId }) => collectionsClient.removeProduct(id, productId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

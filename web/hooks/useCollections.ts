'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsClient } from '@/lib/collections/client';
import { Collection, CollectionFormValues } from '@/lib/collections/types';

export const COLLECTIONS_KEY = ['collections'];

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
    mutationFn: collectionsClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<Collection[]>(COLLECTIONS_KEY, (old) =>
        old ? [...old, created] : [created]
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; data: Partial<CollectionFormValues> }>({
    mutationFn: ({ id, data }) => collectionsClient.update(id, data),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: collectionsClient.delete,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Collection[]>(COLLECTIONS_KEY, (old) =>
        old ? old.filter((c) => c.id !== id) : []
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useAddItemsToCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; itemIds: string[] }>({
    mutationFn: ({ id, itemIds }) => collectionsClient.addItems(id, itemIds),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useRemoveItemFromCollection() {
  const queryClient = useQueryClient();
  return useMutation<Collection, Error, { id: string; itemId: string }>({
    mutationFn: ({ id, itemId }) => collectionsClient.removeItem(id, itemId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { inventoryClient, type TrashDeletion } from '@/lib/inventory/client';
import { productsClient } from '@/lib/products/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import type { InventoryCategory } from '@shared/inventory';

/**
 * #962: an administrator deletes an entry of the trash for good, or empties
 * the trash of a page. `networkMode: 'always'`: offline the request fails at
 * once instead of waiting, paused, for the connection — a permanent deletion
 * is never queued (the buttons are disabled offline anyway).
 */
const TRASH_KEY = ['inventory', 'trash'];
const PRODUCTS_TRASH_KEY = ['inventory', 'products-trash'];

/** What was deleted leaves both lists of the trash at once, then everything under `inventory` is read again. */
function dropDeleted(queryClient: QueryClient, { itemIds, productIds }: TrashDeletion) {
  const items = new Set(itemIds);
  const products = new Set(productIds);
  queryClient.setQueryData<{ id: string }[]>(TRASH_KEY, (old) => old?.filter((item) => !items.has(item.id)));
  queryClient.setQueryData<{ id: string }[]>(PRODUCTS_TRASH_KEY, (old) => old?.filter((product) => !products.has(product.id)));
}

function usePermanentDelete<V>(mutationFn: (variables: V) => Promise<TrashDeletion>, success: string, error: string) {
  const queryClient = useQueryClient();
  return useMutation<TrashDeletion, Error, V>({
    meta: { handlesError: true },
    networkMode: 'always',
    mutationFn: (variables) => mutationFn(variables),
    onSuccess: (deleted) => {
      dropDeleted(queryClient, deleted);
      notifySuccess(success, undefined);
    },
    onError: () => notifyError(error, undefined),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  });
}

export const useDeleteTrashedItem = () =>
  usePermanentDelete<string>(inventoryClient.deleteFromTrash, 'toast.trash.deleteSuccess', 'toast.trash.deleteError');

export const useDeleteTrashedProduct = () =>
  usePermanentDelete<string>(productsClient.deleteFromTrash, 'toast.trash.deleteSuccess', 'toast.trash.deleteError');

export const useEmptyTrash = () =>
  usePermanentDelete<readonly InventoryCategory[]>(inventoryClient.emptyTrash, 'toast.trash.emptySuccess', 'toast.trash.emptyError');

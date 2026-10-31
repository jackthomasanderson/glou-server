'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productsClient } from '@/lib/products/client';
import type { Product } from '@/lib/products/types';
import { PRODUCTS_KEY, productDetailKey } from '@/hooks/useProducts';

export interface RollbackProductFieldVariables {
  id: string;
  field: string;
  toValue: unknown;
  /** The wine's version the history was read from: a change made meanwhile is refused. */
  expectedUpdatedAt?: string;
}

/**
 * FEAT-05 (#471): "Restaurer cette valeur" on a change of a wine's
 * description — written once, for all its bottles. Whatever the answer, the
 * wine's detail is read again: its history shows the restore, and after a
 * refusal (409) the next attempt starts from the wine as it now is.
 */
export function useRollbackProductField() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, RollbackProductFieldVariables>({
    mutationFn: ({ id, field, toValue, expectedUpdatedAt }) => productsClient.rollback(id, field, toValue, expectedUpdatedAt),
    onSuccess: (saved) => {
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) =>
        old?.map((product) => (product.id === saved.id ? saved : product)));
    },
    onSettled: (_saved, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: productDetailKey(id) });
      // The flat bottles carry the description too (transitional copy).
      void queryClient.invalidateQueries({ queryKey: ['inventory'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

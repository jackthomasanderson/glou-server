'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productsClient } from '@/lib/products/client';
import type { Product } from '@/lib/products/types';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';

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
    // Said by the history's restore dialog (FamilyHistory).
    meta: { handlesError: true },
    mutationFn: ({ id, field, toValue, expectedUpdatedAt }) => productsClient.rollback(id, field, toValue, expectedUpdatedAt),
    onSuccess: (saved) => {
      queryClient.setQueryData<Product[]>(qk.products.list, (old) =>
        old?.map((product) => (product.id === saved.id ? saved : product)));
    },
    // Its drawer (history), the flat bottles (they carry the description too), the bell… follow.
    onSettled: (_saved, error) => invalidateAfterInventoryChange(queryClient, { alreadyWritten: error ? [] : [qk.products.list] }),
  });
}

'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PRODUCTS_KEY, productDetailKey } from '@/hooks/useProducts';
import { SIDEBAR_COUNTS_KEY } from '@/hooks/useSidebarCounts';
import { NetworkError } from '@/lib/network-error';
import { notifyError } from '@/lib/toast';
import { detailWithUnitWrite, withUnitChanges } from '@/lib/products/fromFlat';
import {
  postStockAction, type CorrectBody, type MoveBody, type RepriceBody, type StockAction, type StockWrite,
} from '@/lib/products/stockActions';
import type { Product, ProductDetailView, ProductItem } from '@/lib/products/types';

interface StockVariables<TBody> {
  /** The line as shown: its version goes with the request. */
  item: ProductItem;
  body: TBody;
}

/** Refusals of a stock action said in words; anything else is a plain failure. */
const REFUSALS: Record<string, string> = {
  CONFLICT: 'stockLine.errors.conflict',
};

/**
 * A stock action on one line of a wine's drawer (#471: correct the number,
 * move or reprice part of it). D8: the line asked for (`data`), the others it
 * changed and those it removed are applied to the open drawer and to the
 * wine's card at once; the drawer is then read again for its history.
 */
function useStockAction<TBody extends CorrectBody | MoveBody | RepriceBody>(action: StockAction) {
  const queryClient = useQueryClient();
  return useMutation<StockWrite, Error, StockVariables<TBody>>({
    mutationFn: ({ item, body }) => postStockAction(action, item.id, body, item.updatedAt as string),
    onSuccess: (write, { item }) => {
      const written: ProductItem[] = [write.data, ...write.changed];
      queryClient.setQueryData<ProductDetailView>(productDetailKey(item.productId), (old) =>
        detailWithUnitWrite(old, null, written, write.removedIds));
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => withUnitChanges(old, written, write.removedIds));
    },
    onError: (error, { item }) => {
      // FEAT-108 (point 47): without network, these actions wait for it — said, never queued here.
      if (error instanceof NetworkError) {
        notifyError('stockLine.errors.offline');
        return;
      }
      notifyError(REFUSALS[error.message] ?? 'stockLine.errors.failed');
      // Changed meanwhile: the line is read again, the dialog then sends from it.
      if (error.message === 'CONFLICT') void queryClient.invalidateQueries({ queryKey: productDetailKey(item.productId) });
    },
    onSettled: (_write, _error, { item }) => {
      void queryClient.invalidateQueries({ queryKey: productDetailKey(item.productId) });
      // The flat list (still loaded by the page), cellars, counters and spending follow.
      void queryClient.invalidateQueries({ queryKey: ['inventory'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

/** "Corriger le nombre" (FEAT-92 c3, FEAT-95 c4): lower a group's number, with why. */
export const useCorrectQuantity = () => useStockAction<CorrectBody>('correct');

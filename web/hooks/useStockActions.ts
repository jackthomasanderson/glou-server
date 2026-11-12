'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';
import { NetworkError } from '@/lib/network-error';
import { notifyError } from '@/lib/toast';
import { enqueueMutation, markQueuedResult, queuedMutationOf, shownAfter } from '@/lib/offline/syncEngine';
import type { UnitLike } from '@/lib/offline/optimistic';
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
  QUANTITY_TOO_LARGE: 'stockLine.errors.tooLarge',
  CELLAR_NOT_FOUND: 'stockLine.errors.cellarGone',
  // FEAT-93: the line's cells changed meanwhile — the dialog asks which ones again.
  SLOTS_TO_FREE_REQUIRED: 'stockLine.errors.slotsToFree',
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
    meta: { handlesError: true },
    // FEAT-108: offline, a correction is queued at once, and a move or a new
    // price says at once that it waits for the network (never held unseen).
    networkMode: 'always',
    mutationFn: async ({ item, body }) => {
      try {
        return await postStockAction(action, item.id, body, item.updatedAt as string);
      } catch (error) {
        // FEAT-108 (point 47): "Corriger le nombre" also works without
        // network — shown at once (×6 → ×5, the copies gone in "Déjà bues
        // ou parties"), sent when it is back, checked against the line's
        // version then. Moving or repricing part of a line waits for it.
        if (action !== 'correct' || !(error instanceof NetworkError)) throw error;
        const mutation = await enqueueMutation(queryClient, item.id, { ...body }, item.updatedAt as string, {
          kind: 'correct', productId: item.productId, shown: item as unknown as UnitLike,
        });
        const shown = shownAfter(item, mutation);
        return markQueuedResult<StockWrite>({ data: shown as unknown as StockWrite['data'], changed: [], removedIds: [] }, mutation.id);
      }
    },
    onSuccess: (write, { item }) => {
      // Queued without network: already shown by the queue.
      if (queuedMutationOf(write)) return;
      const written: ProductItem[] = [write.data, ...write.changed];
      queryClient.setQueryData<ProductDetailView>(qk.products.detail(item.productId), (old) =>
        detailWithUnitWrite(old, null, written, write.removedIds));
      queryClient.setQueryData<Product[]>(qk.products.list, (old) => withUnitChanges(old, written, write.removedIds));
    },
    onError: (error) => {
      // FEAT-108 (point 47): without network, these actions wait for it — said, never queued here.
      if (error instanceof NetworkError) {
        notifyError('stockLine.errors.offline');
        return;
      }
      notifyError(REFUSALS[error.message] ?? 'stockLine.errors.failed');
    },
    // The drawer (its history; after a refusal, the line the dialog sends from
    // next), the flat list, cellars, counters, spending… follow. The wines were
    // written above.
    onSettled: (_write, error) => invalidateAfterInventoryChange(queryClient, { alreadyWritten: error ? [] : [qk.products.list] }),
  });
}

/** "Corriger le nombre" (FEAT-92 c3, FEAT-95 c4): lower a group's number, with why. */
export const useCorrectQuantity = () => useStockAction<CorrectBody>('correct');
/** "Déplacer" (FEAT-98 c1-c4): some or all of a group to another cellar. */
export const useMoveUnits = () => useStockAction<MoveBody>('move');
/** "Changer le prix" (FEAT-98 c5): of some or all of a group. */
export const useRepriceUnits = () => useStockAction<RepriceBody>('reprice');

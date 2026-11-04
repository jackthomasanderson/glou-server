'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UnitKind } from '@shared/units';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { productDetailKey } from '@/hooks/useProducts';
import { notifySuccess, notifyUndoable } from '@/lib/toast';
import { movePatch, undoPatch, type StockMove } from '@/lib/products/openDrink';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

/**
 * #471 (FEAT-103, ux-ui.md §10.4.2): open, drink or smoke one copy of a line.
 * Sent from the line's latest known version (a change made meanwhile is
 * refused, 409, rather than overwritten). The caches follow the D8 answer
 * (useUpdateInventoryItem: the sub-record, the group decremented); the
 * message "1 bouteille ouverte · Annuler" puts the copy back for 5 seconds.
 * Resolves true once written, false when refused (already told).
 */
export function useStockMove() {
  const queryClient = useQueryClient();
  const update = useUpdateInventoryItem();
  const { mutateAsync } = update;

  /** The line as the drawer knows it now (its level set since, its version). */
  const latest = useCallback((item: Pick<ProductItem, 'id' | 'productId'>): ProductItem | undefined =>
    queryClient.getQueryData<ProductDetailView>(productDetailKey(item.productId))?.items.find((unit) => unit.id === item.id),
  [queryClient]);

  const settle = useCallback((productId: string) => {
    // Its history ("a ouvert 1 bouteille") and the spending pages follow.
    void queryClient.invalidateQueries({ queryKey: productDetailKey(productId) });
    void queryClient.invalidateQueries({ queryKey: ['budget'] });
  }, [queryClient]);

  const undo = useCallback(async (written: ProductItem, kind: UnitKind) => {
    const current = latest(written) ?? written;
    try {
      await mutateAsync({ id: written.id, patch: undoPatch(written, kind), expectedUpdatedAt: current.updatedAt as string });
    } catch {
      // Refused (a tasting noted on it meanwhile, a conflict): told by the mutation.
    } finally {
      settle(written.productId);
    }
  }, [latest, mutateAsync, settle]);

  const run = useCallback(async (item: ProductItem, move: StockMove, kind: UnitKind): Promise<boolean> => {
    const sent = (latest(item) ?? item).updatedAt as string;
    let written: ProductItem;
    try {
      written = await mutateAsync({ id: item.id, patch: movePatch(move), expectedUpdatedAt: sent }) as unknown as ProductItem;
    } catch {
      // Told by the mutation; the drawer is read again so the next try starts from the line as it is.
      settle(item.productId);
      return false;
    }
    settle(item.productId);
    const message = `openDrink.done.${move}`;
    // Without network the write waits in the offline queue (FEAT-108): nothing
    // was written yet, so there is nothing to take back from here.
    const queued = written.id === item.id && written.updatedAt === sent;
    if (queued) notifySuccess(message);
    else notifyUndoable(message, undefined, () => { void undo(written, kind); });
    return true;
  }, [latest, mutateAsync, settle, undo]);

  return { run, isPending: update.isPending };
}

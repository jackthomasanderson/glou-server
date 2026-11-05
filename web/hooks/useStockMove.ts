'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UnitKind } from '@shared/units';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { productDetailKey } from '@/hooks/useProducts';
import { notifyError, notifyUndoable } from '@/lib/toast';
import { discardQueuedMutation, queuedMutationOf } from '@/lib/offline/syncEngine';
import { isProvisional } from '@/lib/offline/optimistic';
import { isIntactItem } from '@shared/units';
import { movePatch, restorePatch, undoPatch, type StockMove } from '@/lib/products/openDrink';
import type { InventoryItem, InventoryItemPatch } from '@/lib/inventory/types';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

/** FEAT-93: the cell the line itself gave back by this write (a line of one finished in place), to ask back on "Annuler". */
function cellGivenBack(before: ProductItem, written: Pick<InventoryItem, 'id' | 'slots'>): InventoryItemPatch {
  const [cell] = before.slots ?? [];
  if (written.id !== before.id || !cell || (written.slots ?? []).some((slot) => slot.id === cell.id)) return {};
  return { placeAt: { column: cell.column, row: cell.row } };
}

/**
 * #471 (FEAT-103, ux-ui.md §10.4.2): open, drink or smoke one copy of a line.
 * Sent from the line's latest known version (a change made meanwhile is
 * refused, 409, rather than overwritten). The caches follow the D8 answer
 * (useUpdateInventoryItem: the sub-record, the group decremented); the
 * message "1 bouteille ouverte · Annuler" puts the copy back for 8 seconds.
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

  /**
   * Puts the copy `written` (its id, its version) back as it was: intact when
   * taken from a full line, else opened at its level (an opened bottle
   * finished, a cigar smoked out of an opened box, FEAT-105); with `extra`
   * (a grid slot given back).
   */
  const undo = useCallback(async (
    written: Pick<InventoryItem, 'id' | 'updatedAt' | 'cigarsPerBox'>,
    item: ProductItem,
    kind: UnitKind,
    extra: InventoryItemPatch,
  ) => {
    const current = latest({ id: written.id, productId: item.productId });
    const back = isIntactItem(item) ? undoPatch({ cigarsPerBox: written.cigarsPerBox ?? null }, kind) : restorePatch(item);
    try {
      await mutateAsync({
        id: written.id,
        patch: { ...back, ...extra },
        expectedUpdatedAt: (current?.updatedAt as string | undefined) ?? written.updatedAt,
      });
    } catch {
      // Refused (a tasting noted on it meanwhile, a conflict, its slot taken since): told by the mutation.
    } finally {
      settle(item.productId);
    }
  }, [latest, mutateAsync, settle]);

  const run = useCallback(async (item: ProductItem, move: StockMove, kind: UnitKind): Promise<boolean> => {
    // FEAT-108: a copy shown before the server took it off its group has no id there yet.
    if (isProvisional(item)) return false;
    // The line as known now: its version, and its level to put back on "Annuler".
    const before = latest(item) ?? item;
    const sent = before.updatedAt as string;
    let written: InventoryItem;
    try {
      written = await mutateAsync({ id: item.id, patch: movePatch(move), expectedUpdatedAt: sent });
    } catch {
      // Told by the mutation; the drawer is read again so the next try starts from the line as it is.
      settle(item.productId);
      return false;
    }
    settle(item.productId);
    const message = `openDrink.done.${move}`;
    // Without network the write waits in the offline queue (FEAT-108),
    // already shown ("en attente"): "Annuler" drops it from the queue and
    // puts the copy back on screen — nothing was written on the server.
    const queued = queuedMutationOf(written);
    if (queued) {
      notifyUndoable(`openDrink.queued.${move}`, undefined, () => {
        void discardQueuedMutation(queued, queryClient).then((dropped) => {
          // Already being sent: it is taken back like any other ("Annuler l'ouverture").
          if (!dropped) notifyError('offline.undoTooLate');
        });
      });
      return true;
    }
    // FEAT-93: a line of one drunk (or smoked out) in place gave its cell
    // back (#573); "Annuler" puts the bottle back in that cell, if nobody
    // took it since (`placeAt`, else it comes back unplaced).
    notifyUndoable(message, undefined, () => { void undo(written, before, kind, cellGivenBack(before, written)); });
    return true;
  }, [latest, mutateAsync, queryClient, settle, undo]);

  return { run, isPending: update.isPending };
}

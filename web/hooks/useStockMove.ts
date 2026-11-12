'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UnitKind } from '@shared/units';
import { SLOT_CHANGED, SLOT_CHOICE_REQUIRED, type SlotChoiceFields } from '@shared/product';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { qk } from '@/lib/queryKeys';
import { notifyError, notifyUndoable } from '@/lib/toast';
import { discardQueuedMutation, queuedMutationOf } from '@/lib/offline/syncEngine';
import { isProvisional } from '@/lib/offline/optimistic';
import { isIntactItem } from '@shared/units';
import { movePatch, restorePatch, undoPatch, type StockMove } from '@/lib/products/openDrink';
import { cellAskOf, type CellAsk } from '@/lib/products/cells';
import type { InventoryItem, InventoryItemPatch } from '@/lib/inventory/types';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

/**
 * FEAT-93: the cell this write gave back — the cell chosen for a copy taken
 * off its group and finished there, or the cell of a line of one finished in
 * place — to ask back on "Annuler" (`placeAt`). Nothing when the copy still
 * holds it (opened: the cell went with it, and comes back with it).
 */
export function cellGivenBack(
  before: Pick<ProductItem, 'id' | 'slots' | 'quantity' | 'cigarsPerBox'>,
  written: Pick<InventoryItem, 'id' | 'slots'>,
  choice?: SlotChoiceFields,
  kind: UnitKind = 'bottle',
): InventoryItemPatch {
  // A group of single cigars shares one cell, kept until its last cigar: nothing given back.
  if (kind === 'cigar' && before.cigarsPerBox == null && written.id !== before.id) return {};
  const cells = before.slots ?? [];
  const cell = choice?.fromSlotId
    ? cells.find((slot) => slot.id === choice.fromSlotId)
    : written.id === before.id ? cells[0] : undefined;
  if (!cell || (written.slots ?? []).some((slot) => slot.id === cell.id)) return {};
  return { placeAt: { column: cell.column, row: cell.row } };
}

/** Options of a move: which copy, and who asks "De quelle case ?" when the API does. */
export interface MoveOptions {
  /** The copy's cell: chosen in "De quelle case ?", or the cell of the plan touched (FEAT-93). */
  choice?: SlotChoiceFields;
  /**
   * The API asks which cell the copy comes from (409 SLOT_CHOICE_REQUIRED),
   * or again once the line changed (SLOT_CHANGED): the question to put.
   * Without it, the refusal is only told.
   */
  onAskCell?: (ask: CellAsk) => void;
}

/** Refusals answered by a question ("De quelle case ?"), not a toast of the mutation. */
const CELL_QUESTIONS = [SLOT_CHOICE_REQUIRED, SLOT_CHANGED] as const;

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
    queryClient.getQueryData<ProductDetailView>(qk.products.detail(item.productId))?.items.find((unit) => unit.id === item.id),
  [queryClient]);

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
      // Its history ("a ouvert 1 bouteille") and what derives from the stock follow the mutation (#621).
    }
  }, [latest, mutateAsync]);

  const run = useCallback(async (item: ProductItem, move: StockMove, kind: UnitKind, options: MoveOptions = {}): Promise<boolean> => {
    // FEAT-108: a copy shown before the server took it off its group has no id there yet.
    if (isProvisional(item)) return false;
    // The line as known now: its version, and its level to put back on "Annuler".
    const before = latest(item) ?? item;
    const sent = before.updatedAt as string;
    let written: InventoryItem;
    try {
      written = await mutateAsync({
        id: item.id,
        patch: { ...movePatch(move), ...options.choice },
        expectedUpdatedAt: sent,
        quiet: CELL_QUESTIONS,
      });
    } catch (error) {
      // FEAT-93: the line holds cells — which one? Asked, or asked again with
      // the line as it is now (a cell taken out or drunk on another device).
      const ask = cellAskOf(error);
      if (error instanceof Error && error.message === SLOT_CHANGED) notifyError('stockLine.errors.slotChanged');
      if (ask && options.onAskCell) options.onAskCell(ask);
      else if (error instanceof Error && error.message === SLOT_CHOICE_REQUIRED) notifyError('stockLine.errors.slotChoice');
      // Otherwise told by the mutation, which reads the drawer again (#621): the next try starts from the line as it is.
      return false;
    }
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
    // FEAT-93: a copy finished in its cell gave it back (#573) — a line of
    // one, or a copy taken from the cell chosen; "Annuler" puts it back in
    // that cell, if nobody took it since (`placeAt`, else it comes back unplaced).
    notifyUndoable(message, undefined, () => { void undo(written, before, kind, cellGivenBack(before, written, options.choice, kind)); });
    return true;
  }, [latest, mutateAsync, queryClient, undo]);

  return { run, isPending: update.isPending };
}

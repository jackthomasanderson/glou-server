import type { UnitKind } from '@shared/units';
import type { InventoryItemPatch } from '@/lib/inventory/types';
import type { ProductItem } from './types';

/**
 * #471 (FEAT-103, ux-ui.md §10.4.2-10.4.3): "J'en ouvre une", "J'en bois une",
 * "J'en fume un". Written as a state on one line (PATCH /api/inventory/:id);
 * the API takes the copy off a group of more than one (a sub-record) and
 * changes a line of one itself (K, stock-state.service.ts).
 */
export type StockMove = 'open' | 'drink' | 'smoke';

/** The moves of a wine: open or drink a bottle, smoke a cigar. The first one is the drawer's main action. */
export const movesFor = (kind: UnitKind): readonly StockMove[] => (kind === 'cigar' ? ['smoke'] : ['open', 'drink']);

/** The state a move writes on the line it takes a copy from. */
export function movePatch(move: StockMove, now: Date = new Date()): InventoryItemPatch {
  if (move === 'smoke') return { smokeOne: true };
  if (move === 'drink') return { isOpened: true, fillLevel: 0 };
  // Just opened: full, its level set right after on its own line.
  return { isOpened: true, fillLevel: 100, openedAt: now.toISOString() };
}

/**
 * "Annuler" a move: the copy put back intact — closed and full, a box with
 * all its cigars — which the API puts back into its line of origin (or a
 * line of one when that line is gone).
 */
export function undoPatch(written: Pick<ProductItem, 'cigarsPerBox'>, kind: UnitKind): InventoryItemPatch {
  if (kind === 'bottle') return { isOpened: false, fillLevel: 100 };
  if (written.cigarsPerBox != null) return { isOpened: false, fillLevel: null, cigarsLeft: written.cigarsPerBox };
  return { isOpened: false, fillLevel: null };
}

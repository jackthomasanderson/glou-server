import { isFinishedState, isIntactItem, unitKind, type UnitKind } from '@shared/units';
import { stockSummaryOf } from './filters';
import type { BulkWinesAction } from './client';
import type { Product, ProductItem } from './types';

/**
 * #471 (FEAT-111, ux-ui.md §10.4.8): the bulk actions on the wines selected
 * in the list. Pure: the dialogs render it, the tests read it.
 */

/** The wines selected that still have bottles (cigars) in the cellar: the only ones a bulk action changes. */
export const winesInStock = (products: readonly Product[], selectedIds: ReadonlySet<string>): Product[] =>
  products.filter((product) => selectedIds.has(product.id) && stockSummaryOf(product).units > 0);

/** Bottles (cigars) in the cellar of the wines selected: the "14 bouteilles" of "3 vins, 14 bouteilles" (c4: never a drunk one). */
export const unitsInStock = (products: readonly Product[], selectedIds: ReadonlySet<string>): number =>
  winesInStock(products, selectedIds).reduce((sum, product) => sum + stockSummaryOf(product).units, 0);

/** One wine of "Marquer comme bus": how many it has, and its opened bottle (box) finished first. */
export interface DrinkChoice {
  product: Product;
  kind: UnitKind;
  /** Bottles (cigars) in the cellar: the most that can be marked. */
  units: number;
  /** The opened bottle (box) proposed first — the oldest opening — or null. */
  opened: ProductItem | null;
}

const openedAt = (item: ProductItem) => (item.openedAt ? Date.parse(item.openedAt) : 0);

export function drinkChoices(products: readonly Product[], selectedIds: ReadonlySet<string>): DrinkChoice[] {
  return winesInStock(products, selectedIds).map((product) => {
    const opened = product.items
      .filter((item) => item.deletedAt == null && item.writtenOffAt == null && !isIntactItem(item) && !isFinishedState(item))
      .sort((a, b) => openedAt(a) - openedAt(b))[0] ?? null;
    return { product, kind: unitKind(product.category), units: stockSummaryOf(product).units, opened };
  });
}

/** What the member answered for one wine: how many, and whether its opened one goes first. */
export interface DrinkAnswer {
  count: number;
  openedFirst: boolean;
}

/** The default answer (decision #471, point 42): 1, the opened one first. */
export const DEFAULT_DRINK_ANSWER: DrinkAnswer = { count: 1, openedFirst: true };

/** The request of "Marquer comme bus"; the cellars being looked at are preselected (FEAT-104). */
export function drinkRequest(
  choices: readonly DrinkChoice[],
  answers: Readonly<Record<string, DrinkAnswer>>,
  cellarIds: readonly string[] = [],
): Extract<BulkWinesAction, { action: 'drink' }> {
  return {
    action: 'drink',
    items: choices.map(({ product, units, opened }) => {
      const answer = answers[product.id] ?? DEFAULT_DRINK_ANSWER;
      return { productId: product.id, count: Math.min(Math.max(answer.count, 1), units), openedFirst: opened ? answer.openedFirst : true };
    }),
    ...(cellarIds.length > 0 ? { cellarIds: [...cellarIds] } : {}),
  };
}

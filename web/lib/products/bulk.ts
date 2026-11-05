import { isFinishedState, isIntactItem, itemUnits, unitKind, type UnitKind } from '@shared/units';
import { stockSummaryOf } from './filters';
import { wineName } from './stock';
import type { BulkWinesAction } from '@shared/product';
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * "3 vins, 14 bouteilles" — what a bulk action applies to: the wines selected
 * that still have bottles in the cellar, and those bottles. On the cigars
 * page: "2 références, 50 cigares".
 */
export function bulkSummary(products: readonly Product[], selectedIds: ReadonlySet<string>, cigars: boolean, t: Translate): string {
  return t('familyList.bulkSummary', {
    wines: t('familyList.wines', { count: winesInStock(products, selectedIds).length, context: cigars ? 'cigar' : undefined }),
    bottles: t(cigars ? 'familyList.stock.spoken.cigars' : 'familyList.stock.spoken.bottles', { count: unitsInStock(products, selectedIds) }),
  });
}

/** Wines named in a recap before "et N autres". */
const NAMED_WINES = 3;

/**
 * Recette #471: which wines a bulk action applies to — "ZZ Recette B", or
 * "A, B, C et 2 autres" — the wines selected still in the cellar.
 */
export function bulkWineNames(products: readonly Product[], selectedIds: ReadonlySet<string>, t: Translate): string {
  const names = winesInStock(products, selectedIds).map(wineName);
  const shown = names.slice(0, NAMED_WINES).join(', ');
  return names.length > NAMED_WINES ? t('bulkWines.andOthers', { names: shown, count: names.length - NAMED_WINES }) : shown;
}

/**
 * Recette #471: bottles (cigars) of the wines selected already in the cellar
 * a move goes to (`null`: without a cellar) — the API leaves them where they
 * are, so "11 bouteilles" moves 9 when 2 are there already.
 */
export const unitsAlreadyIn = (products: readonly Product[], selectedIds: ReadonlySet<string>, cellarId: string | null): number =>
  winesInStock(products, selectedIds)
    .flatMap((product) => product.items)
    .filter((item) => item.deletedAt == null && (item.cellarId ?? null) === cellarId)
    .reduce((sum, item) => sum + itemUnits(item), 0);

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

import { isIntactItem } from '@shared/units';
import type { Product, ProductItem } from '@/lib/products/types';
import type { TastedWine, TastingFormValues, TastingNote } from './types';

// #471 (FEAT-107): a tasting is of a wine (the family) — of one of its
// bottles in the cellar, or tasted elsewhere (at a friend's, a restaurant):
// the wine only, the stock untouched. A wine Glou does not know is named,
// and Glou adds it without any bottle.

/** "Cuvée A — Domaine X (2020)", "Siglo VI — Cohiba · Robusto": a wine in the list of the form. */
export function wineOptionLabel(product: Pick<Product, 'name' | 'producer' | 'vintage' | 'format' | 'category'>): string {
  const vintage = product.vintage ? ` (${product.vintage})` : '';
  const vitola = product.category === 'cigar' && product.format ? ` · ${product.format}` : '';
  return `${product.name} — ${product.producer}${vintage}${vitola}`;
}

/**
 * The line a tasting is preset on (ux-ui.md §10.4: no question when the
 * answer is obvious): the bottle given if it is still in the cellar, else the
 * opened one — the one being drunk —, else the only line. Several lines and
 * none opened: none, the member picks; never a full one chosen for them,
 * which a "Bue" answer would then take off its group.
 */
export function tastingLinePreset(inCellar: readonly ProductItem[], itemId?: string): ProductItem | undefined {
  return inCellar.find((item) => item.id === itemId)
    ?? inCellar.find((item) => !isIntactItem(item))
    ?? (inCellar.length === 1 ? inCellar[0] : undefined);
}

/** How the wine of a new tasting is given. */
export type TastedWineMode =
  /** Picked from the list; on one of its bottles of the cellar, or not. */
  | { kind: 'listed'; onBottle: boolean }
  /** Named: Glou finds it, or adds it without any bottle. */
  | { kind: 'named' }
  /** An existing tasting: its wine never changes. */
  | { kind: 'edit' };

/** What a named wine sends: only what its category keeps (a vintage is not a cigar's, a vitola only a cigar's). */
function namedWine(wine: TastedWine): TastedWine {
  const isCigar = wine.category === 'cigar';
  const keepsVintage = wine.category === 'wine' || wine.category === 'sparkling';
  return {
    category: wine.category,
    producer: wine.producer.trim(),
    name: wine.name.trim(),
    ...(keepsVintage && wine.vintage != null ? { vintage: wine.vintage } : {}),
    ...(isCigar && wine.format?.trim() ? { format: wine.format.trim() } : {}),
  };
}

/** The body of POST/PATCH /api/tastings for what the form holds. */
export function tastingPayload(values: TastingFormValues, mode: TastedWineMode): TastingFormValues {
  const { itemId, productId, wine, ...fields } = values;
  if (mode.kind === 'edit') return itemId ? { ...fields, itemId } : fields;
  if (mode.kind === 'named') return wine ? { ...fields, wine: namedWine(wine) } : fields;
  return {
    ...fields,
    ...(productId ? { productId } : {}),
    ...(mode.onBottle && itemId ? { itemId } : {}),
  };
}

/** A year typed in a text field: a whole number, else none. */
export function parseYear(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * "Cuvée A — Domaine X" of a tasting: its wine, read on the wine itself
 * (a tasting elsewhere has no bottle), else on the bottle; null when neither is known.
 */
export function tastedWineTitle(note: Pick<TastingNote, 'item' | 'product'>): string | null {
  const wine = note.product ?? note.item;
  return wine ? `${wine.name} — ${wine.producer}` : null;
}

/** The photo of what was tasted: the bottle's, else the wine's. */
export const tastedPhoto = (note: Pick<TastingNote, 'item' | 'product'>) => note.item?.photoUrl ?? note.product?.photoUrl ?? undefined;

/** A tasting of a known wine, not of a bottle of the cellar ("Goûté ailleurs"). */
export const isTastedElsewhere = (note: Pick<TastingNote, 'itemId' | 'productId'>) => !note.itemId && !!note.productId;

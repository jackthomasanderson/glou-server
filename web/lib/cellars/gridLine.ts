import { unitKind } from '@shared/units';
import { formatCurrency } from '@/lib/format';
import { formatPurchaseDay } from '@/lib/products/lines';
import type { GridItem } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A group of single cigars: its cigars share one cell (FEAT-93). */
const isSingleCigars = (item: GridItem) => unitKind(item.category) === 'cigar' && item.cigarsPerBox == null && !item.isOpened;

/** "20 € / bouteille", "3 nov. 2026": the price and day that tell two lines of a wine apart. */
function purchaseParts(item: GridItem, t: Translate, lang: string | undefined): (string | null)[] {
  const per = unitKind(item.category) !== 'cigar' ? 'perBottle' : item.cigarsPerBox != null ? 'perBox' : 'perCigar';
  return [
    item.purchasePrice != null ? t(`familyDrawer.lines.${per}`, { price: formatCurrency(item.purchasePrice, lang) }) : null,
    item.purchasedAt ? formatPurchaseDay(item.purchasedAt, lang) : null,
  ];
}

const present = (parts: (string | null)[]): string[] => parts.filter((part): part is string => Boolean(part));

/**
 * Recette #471 (KO 13.2): what a line of the cellar map is, said as in the
 * wine's drawer — "×6 · 20 € / bouteille · 3 nov. 2026", "Boîte entamée ·
 * 23 restants", "1 boîte fermée de 25 · 200 € / boîte" — so that two lines
 * of the same wine (a closed box and an opened one, two purchase days) read
 * apart where one is chosen for a slot.
 */
export function gridLineParts(item: GridItem, t: Translate, lang: string | undefined): string[] {
  const copies = item.quantity ?? 1;
  const cigar = unitKind(item.category) === 'cigar';
  const head = cigar
    ? item.isOpened
      ? [t('familyDrawer.lines.openedBox'), t('familyDrawer.lines.cigarsLeft', { count: item.cigarsLeft ?? 0 })]
      : item.cigarsPerBox != null
        ? [t('familyDrawer.lines.closedBoxes', { count: copies, size: item.cigarsPerBox })]
        : [t('familyDrawer.lines.singleCigars', { count: copies })]
    : [item.isOpened ? t('familyDrawer.lines.opened') : t('familyDrawer.lines.count', { number: copies })];
  return present([...head, ...purchaseParts(item, t, lang)]);
}

/**
 * FEAT-93: what one cell holds, for its tooltip — one bottle or one box of
 * its line ("Boîte fermée de 25", "Boîte entamée · 23 restants",
 * "Entamée"), or every cigar of a group of single cigars. A full bottle
 * says nothing more than its wine: never the "×6" of its line.
 */
export function cellParts(item: GridItem, t: Translate, lang: string | undefined): string[] {
  const cigar = unitKind(item.category) === 'cigar';
  const head = item.isOpened
    ? cigar
      ? [t('familyDrawer.lines.openedBox'), t('familyDrawer.lines.cigarsLeft', { count: item.cigarsLeft ?? 0 })]
      : [t('familyDrawer.lines.opened')]
    : !cigar
      ? []
      : item.cigarsPerBox != null
        ? [t('cellars.grid.closedBox', { size: item.cigarsPerBox })]
        : [t('familyDrawer.lines.singleCigars', { count: item.quantity ?? 1 })];
  return present([...head, ...purchaseParts(item, t, lang)]);
}

/**
 * FEAT-93: the "×N" badge of a cell, only where a cell holds several
 * things — every cigar of a group of single cigars. A bottle and a box have
 * their own cell (the box's size is in its tooltip).
 */
export function cellBadge(item: GridItem): number | null {
  return isSingleCigars(item) && item.units > 1 ? item.units : null;
}

/**
 * FEAT-93 c2: in "Assigner", how many copies of the line are placed and
 * still to place — "6 non rangées", "2 rangées, 4 non rangées". Nothing for a
 * group of single cigars: one cell for the whole group.
 */
export function placementText(item: GridItem, t: Translate): string {
  if (isSingleCigars(item)) return '';
  const placed = item.slots.length;
  const unplaced = t('cellars.grid.unplaced', { count: item.unplaced });
  return placed > 0 ? `${t('cellars.grid.placed', { count: placed })}, ${unplaced}` : unplaced;
}

/**
 * FEAT-93 c2: why a copy of the line cannot be placed (409 NO_UNPLACED_COPY)
 * — "Les 6 bouteilles de cette ligne sont déjà rangées.", counted on the
 * copies the line can place (its cells and its unplaced copies).
 */
export function noUnplacedCopyText(item: GridItem, t: Translate): string {
  const cigar = unitKind(item.category) === 'cigar';
  const context = isSingleCigars(item) ? 'cigar' : cigar ? 'box' : undefined;
  return t('cellars.grid.noUnplacedCopy', { count: item.slots.length + item.unplaced, context });
}

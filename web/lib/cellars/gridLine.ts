import { unitKind } from '@shared/units';
import { formatCurrency } from '@/lib/format';
import { formatPurchaseDay } from '@/lib/products/lines';
import type { GridItem } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
  const per = !cigar ? 'perBottle' : item.cigarsPerBox != null ? 'perBox' : 'perCigar';
  return [
    ...head,
    item.purchasePrice != null ? t(`familyDrawer.lines.${per}`, { price: formatCurrency(item.purchasePrice, lang) }) : null,
    item.purchasedAt ? formatPurchaseDay(item.purchasedAt, lang) : null,
  ].filter((part): part is string => Boolean(part));
}

/**
 * The badge of a cell: the units of the copy it holds when more than one —
 * "×25" for a closed box of 25, the cigars left in an opened box, every
 * cigar of a group of single cigars (one cell for the group, FEAT-93). A
 * bottle is one: each bottle of a group has its own cell.
 */
export function slotUnits(item: GridItem): number {
  if (unitKind(item.category) !== 'cigar') return 1;
  if (item.isOpened) return item.cigarsLeft ?? 1;
  if (item.cigarsPerBox != null) return item.cigarsPerBox;
  return item.units;
}

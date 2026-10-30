import type { InventoryItem } from '@/lib/inventory/types';

export type StockChoice = 'opened' | 'consumed' | 'removeOneCigar' | 'ignore';

/** Stock state of the tasted item; undefined when it is not known. */
export type TastedItemStock = Pick<InventoryItem, 'category' | 'isOpened' | 'quantity'>;

export type StockPatch =
  | { isOpened: true; fillLevel: number; openedAt?: string }
  | { quantity: number };

/**
 * Stock updates the "update stock?" question offers after a tasting, besides
 * leaving the stock alone. An empty list means there is nothing to ask.
 */
export function stockChoicesFor(item?: TastedItemStock): StockChoice[] {
  // #586: a box's stock is its number of cigars; one smoked cigar is one
  // cigar less, never the whole box emptied or "opened".
  if (item?.category === 'cigar') return (item.quantity ?? 0) > 0 ? ['removeOneCigar'] : [];
  // #595: an opened bottle is already opened; "opened" would put its level
  // back to 50 % and replace its opening date.
  return item?.isOpened ? ['consumed'] : ['opened', 'consumed'];
}

/** Inventory patch a stock choice stands for; null when the stock is left alone. */
export function stockPatchFor(
  choice: StockChoice,
  item?: TastedItemStock,
  now: Date = new Date(),
): StockPatch | null {
  if (!stockChoicesFor(item).includes(choice)) return null;
  if (choice === 'removeOneCigar') return { quantity: (item?.quantity ?? 0) - 1 };
  if (choice === 'consumed') return { isOpened: true, fillLevel: 0 };
  return { isOpened: true, fillLevel: 50, openedAt: now.toISOString() };
}

/**
 * Apply a stock choice. Resolves true when the dialog may close (nothing to
 * update, or the update succeeded) and false when the update failed — the
 * caller must then keep the dialog open and tell the user (#196).
 */
export async function applyStockChoice(
  choice: StockChoice,
  item: TastedItemStock | undefined,
  update: (patch: StockPatch) => Promise<unknown>,
  onError: () => void,
): Promise<boolean> {
  const patch = stockPatchFor(choice, item);
  if (!patch) return true;
  try {
    await update(patch);
    return true;
  } catch {
    onError();
    return false;
  }
}

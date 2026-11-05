import type { InventoryItem } from '@/lib/inventory/types';
import { isFinishedState, itemUnits } from '@shared/units';

export type StockChoice = 'opened' | 'consumed' | 'smokeOne' | 'ignore';

/** Stock state of the tasted item; undefined when it is not known. */
export type TastedItemStock = Pick<InventoryItem, 'category' | 'isOpened' | 'fillLevel' | 'quantity'
  | 'cigarsPerBox' | 'cigarsLeft' | 'writtenOffAt'>;

export type StockPatch =
  | { isOpened: true; fillLevel: number; openedAt?: string }
  | { smokeOne: true };

/** Cigars still held by the tasted line (0 once smoked through or gone). */
const cigarsIn = (item: TastedItemStock) => itemUnits({
  quantity: item.quantity ?? null,
  isOpened: item.isOpened,
  fillLevel: item.fillLevel ?? null,
  cigarsPerBox: item.cigarsPerBox ?? null,
  cigarsLeft: item.cigarsLeft ?? null,
  writtenOffAt: item.writtenOffAt ?? null,
});

/**
 * #471 (FEAT-95, ux-ui.md §10.4.3): what smoking one cigar does to the
 * tasted line, as the API applies it (`smokeOne`, stock-state.service.ts):
 * the first cigar of a closed box opens it (M − 1 left in it), one of an
 * opened box leaves one less in it, a single cigar leaves N − 1. Null when
 * there is no cigar to smoke.
 */
export function smokeOutcome(item?: TastedItemStock): { kind: 'opensBox' | 'fromBox' | 'single'; left: number } | null {
  if (!item || item.category !== 'cigar' || cigarsIn(item) <= 0) return null;
  if (item.isOpened) return { kind: 'fromBox', left: (item.cigarsLeft ?? 1) - 1 };
  // A closed box of a single cigar is finished at once (the API), never "opened, 0 left".
  if (item.cigarsPerBox === 1) return { kind: 'fromBox', left: 0 };
  if (item.cigarsPerBox != null) return { kind: 'opensBox', left: item.cigarsPerBox - 1 };
  return { kind: 'single', left: Math.max(item.quantity ?? 1, 1) - 1 };
}

/**
 * Stock updates the "update stock?" question offers after a tasting, besides
 * leaving the stock alone. An empty list means there is nothing to ask.
 */
export function stockChoicesFor(item?: TastedItemStock): StockChoice[] {
  // Unknown stock: any update could be wrong (refill an opened bottle,
  // empty a cigar box), so nothing is offered.
  if (!item) return [];
  // #586: one smoked cigar is one cigar less, never the whole box emptied
  // or "opened" — and never `quantity − 1`, which corrects the number of
  // boxes (#471, K): the API smokes it (`smokeOne`).
  if (item.category === 'cigar') return smokeOutcome(item) ? ['smokeOne'] : [];
  // A finished bottle has nothing left to update.
  if (isFinishedState({ isOpened: item.isOpened, fillLevel: item.fillLevel ?? null })) return [];
  // #595: an opened bottle is already opened; "opened" would put its level
  // back to 50 % and replace its opening date.
  return item.isOpened ? ['consumed'] : ['opened', 'consumed'];
}

/** Inventory patch a stock choice stands for; null when the stock is left alone. */
export function stockPatchFor(
  choice: StockChoice,
  item?: TastedItemStock,
  now: Date = new Date(),
): StockPatch | null {
  if (!stockChoicesFor(item).includes(choice)) return null;
  if (choice === 'smokeOne') return { smokeOne: true };
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
  onError: (error: unknown) => void,
): Promise<boolean> {
  const patch = stockPatchFor(choice, item);
  if (!patch) return true;
  try {
    await update(patch);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

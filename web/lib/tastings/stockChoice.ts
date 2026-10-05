export type StockChoice = 'opened' | 'consumed' | 'ignore';

export interface StockPatch {
  isOpened: true;
  fillLevel: number;
  openedAt?: string;
}

/** Inventory patch a stock choice stands for; null when the stock is left alone. */
export function stockPatchFor(choice: StockChoice, now: Date = new Date()): StockPatch | null {
  if (choice === 'ignore') return null;
  return choice === 'consumed'
    ? { isOpened: true, fillLevel: 0 }
    : { isOpened: true, fillLevel: 50, openedAt: now.toISOString() };
}

/**
 * Apply a stock choice. Resolves true when the dialog may close (nothing to
 * update, or the update succeeded) and false when the update failed — the
 * caller must then keep the dialog open and tell the user (#196).
 */
export async function applyStockChoice(
  choice: StockChoice,
  update: (patch: StockPatch) => Promise<unknown>,
  onError: () => void,
): Promise<boolean> {
  const patch = stockPatchFor(choice);
  if (!patch) return true;
  try {
    await update(patch);
    return true;
  } catch {
    onError();
    return false;
  }
}

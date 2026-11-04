import { openableGroups } from '@shared/stock-choice';
import { isFinishedState, isIntactItem, itemUnits } from '@shared/units';
import type { StockMove } from './openDrink';
import type { ProductItem } from './types';

/**
 * #471 (FEAT-105, ux-ui.md §10.4.2-10.4.3, decision #471 points 14, 44, 45):
 * what happens when a bottle is opened, drunk or a cigar smoked on a wine
 * that already has an opened bottle (an opened box). Pure: the dialogs
 * render it, the tests read it.
 */

/**
 * The opened copies a move can be taken from: an opened bottle of ONE bottle
 * (never a line of several, second review of K) or an opened box with
 * cigars left, out of the trash — the oldest opened first (it is preselected).
 */
export function openedCopies(items: readonly ProductItem[]): ProductItem[] {
  return items
    .filter((item) => item.deletedAt == null && item.writtenOffAt == null && !isIntactItem(item)
      && !isFinishedState(item) && itemUnits(item) > 0 && (item.quantity ?? 1) <= 1)
    .sort((a, b) => {
      const at = (item: ProductItem) => (item.openedAt as string | null) ?? null;
      if (at(a) === at(b)) return (a.createdAt as string).localeCompare(b.createdAt as string);
      if (at(a) === null) return 1;
      if (at(b) === null) return -1;
      return (at(a) as string).localeCompare(at(b) as string);
    });
}

/** The first step of a move on a wine. */
export type FirstStep =
  /** Nothing to ask: written on this line. */
  | { step: 'run'; line: ProductItem }
  /** "Une bouteille est déjà entamée…": the opened copies, and whether a full line is left to take a new one from. */
  | { step: 'remind'; opened: ProductItem[]; hasFull: boolean }
  /** "Quelles bouteilles ?": several full lines. */
  | { step: 'which'; groups: ProductItem[] }
  /** Nothing to take it from. */
  | { step: 'none' };

/**
 * The step after the reminder ("En ouvrir une nouvelle", "Non"), or the first
 * one without an opened copy: the line given (a line's menu), the only full
 * line, or the question among several.
 */
export function fullStep(groups: readonly ProductItem[], line?: ProductItem): FirstStep {
  if (line) return { step: 'run', line };
  if (groups.length === 0) return { step: 'none' };
  if (groups.length === 1) return { step: 'run', line: groups[0] };
  return { step: 'which', groups: [...groups] };
}

/**
 * Where a move starts (§10.4.2 step 1, §10.4.3):
 * - an opened copy and a full line: the reminder (open: "Finir l'entamée" /
 *   "En ouvrir une nouvelle"; drink: "C'est elle que vous avez finie ?";
 *   smoke: "Dans la boîte entamée ou en ouvrir une nouvelle ?");
 * - only opened copies left: drink or smoke the only one at once (the answer
 *   is obvious), or ask which among several; opening a new one is impossible;
 * - no opened copy: no reminder (FEAT-105 c5).
 * `line`: the full line a line's menu acts on (no "Quelles bouteilles ?").
 */
export function firstStep(move: StockMove, items: readonly ProductItem[], line?: ProductItem): FirstStep {
  const groups = openableGroups(items);
  const opened = openedCopies(items);
  const hasFull = line !== undefined || groups.length > 0;
  if (opened.length === 0) return fullStep(groups, line);
  if (hasFull) return { step: 'remind', opened, hasFull };
  if (move === 'open') return { step: 'none' };
  if (opened.length === 1) return { step: 'run', line: opened[0] };
  return { step: 'remind', opened, hasFull: false };
}

/** The moves the drawer's footer offers: opening needs a full line; drinking or smoking an opened one does not. */
export function footerMoves(moves: readonly StockMove[], items: readonly ProductItem[]): StockMove[] {
  const hasFull = openableGroups(items).length > 0;
  const hasOpened = openedCopies(items).length > 0;
  return moves.filter((move) => hasFull || (move !== 'open' && hasOpened));
}

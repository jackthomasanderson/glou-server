import { isIntactItem, slotCapacity, type UnitKind, type UnitState } from '@shared/units';
import {
  SLOT_CHANGED, SLOT_CHOICE_REQUIRED, SLOTS_TO_FREE_REQUIRED,
  type ItemSlotView, type SlotChoiceDetails, type SlotChoiceFields, type SlotsToFreeDetails,
} from '@shared/product';

// FEAT-93 (#847, lot S4): the cells of the cellar plan a line holds, as the
// drawer and its dialogs say and ask them. Pure: the dialogs render it, the
// tests read it. The API applies the same rules (stock-state.service.ts,
// lib/slots.ts) and answers 409 when the screen was out of date.

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A line as these rules read it: its state and the cells it holds. */
export type CellLine = Pick<UnitState, 'quantity' | 'isOpened' | 'fillLevel' | 'cigarsPerBox' | 'cigarsLeft' | 'writtenOffAt'>
  & { slots?: readonly ItemSlotView[] | null };

const cellsOf = (line: CellLine): ItemSlotView[] => [...(line.slots ?? [])];

/** A group of single cigars: one cell for the whole group (decision #471 point 48), never a question. */
const isSingleCigars = (line: CellLine, kind: UnitKind) => kind === 'cigar' && line.cigarsPerBox == null;

/** "C2·R3": a cell, short. */
export const cellShort = (cell: Pick<ItemSlotView, 'column' | 'row'>, t: Translate) =>
  t('cellars.grid.cellShort', { col: cell.column, row: cell.row });
/** "Case C2·R3": a cell, named. */
export const cellTitle = (cell: Pick<ItemSlotView, 'column' | 'row'>, t: Translate) =>
  t('cellars.grid.slotTitle', { col: cell.column, row: cell.row });

/** The copies of a line that hold no cell of the plan (a group of single cigars: 1 while it has no cell). */
export const unplacedCopies = (line: CellLine, kind: UnitKind): number =>
  Math.max(0, slotCapacity(line, kind) - cellsOf(line).length);

/**
 * Plan §5 (tiroir): "4 rangées, 2 non rangées · C1·R1, C1·R2, …" — the
 * copies of a line placed on the plan and those not, and where. A group of
 * single cigars holds one cell for all of them: just where. A line without
 * any cell says "1 non rangée" like the others when its cellar has a plan
 * (`onPlan`, recette n°5 of #847), nothing otherwise (no noise for a cellar
 * without a plan).
 */
export function slotSummary(line: CellLine, kind: UnitKind, t: Translate, onPlan = false): string | null {
  const cells = cellsOf(line);
  const unplaced = unplacedCopies(line, kind);
  if (cells.length === 0) {
    if (!onPlan || unplaced === 0) return null;
    return isSingleCigars(line, kind) && isIntactItem(line)
      ? t('familyDrawer.slots.groupUnplaced')
      : t('familyDrawer.slots.unplaced', { count: unplaced });
  }
  const where = cells.map((cell) => cellShort(cell, t)).join(', ');
  if (isSingleCigars(line, kind) && isIntactItem(line)) return t('familyDrawer.slots.groupCell', { cells: where });
  const counts = [
    t('familyDrawer.slots.placed', { count: cells.length }),
    ...(unplaced > 0 ? [t('familyDrawer.slots.unplaced', { count: unplaced })] : []),
  ].join(', ');
  return t('familyDrawer.slots.summary', { counts, cells: where });
}

/** "De quelle case ?": the cells a copy may be taken from, and how many copies are unplaced. */
export type CellAsk = SlotChoiceDetails;

/**
 * Plan §4 (ouvrir, boire, fumer): which copy of the line leaves matters only
 * on a group of several holding at least one cell — never a line of one (it
 * is the copy), never a group of single cigars (its one cell stays until the
 * last). Null: nothing to ask.
 */
export function cellChoiceFor(line: CellLine, kind: UnitKind): CellAsk | null {
  const cells = cellsOf(line);
  const copies = line.quantity ?? 1;
  if (!isIntactItem(line) || copies < 2 || cells.length === 0 || isSingleCigars(line, kind)) return null;
  return { slots: cells, unplaced: Math.max(0, copies - cells.length) };
}

/** The "Non rangée" answer of "De quelle case ?". */
export const UNPLACED = 'unplaced';

/** Decision #471 point 76: "Non rangée" preselected while a copy is unplaced, else nothing — the member touches a cell. */
export const preselectedCell = (ask: CellAsk): string | null => (ask.unplaced > 0 ? UNPLACED : null);

/** The answer sent with the move: the cell chosen, or an unplaced copy. */
export const cellAnswer = (choice: string): SlotChoiceFields =>
  (choice === UNPLACED ? { fromUnplaced: true } : { fromSlotId: choice });

/**
 * Plan §4 (corriger, sortir, déplacer, changer le prix d'une partie): the
 * cells to name when a line keeps `keep` of its copies and they can no longer
 * hold all its cells — unplaced copies leave first (decision #471 point 74),
 * so only the cells beyond what is kept. 0: nothing to ask. A line left
 * empty frees everything without a question.
 */
export function cellsToName(line: CellLine, keep: number, kind: UnitKind): number {
  if (keep <= 0) return 0;
  const cells = cellsOf(line).length;
  return Math.max(0, cells - slotCapacity({ ...line, quantity: keep }, kind));
}

/** The details of a 409 that asks "De quelle case ?" (or again, the line having changed). */
export function cellAskOf(error: unknown): CellAsk | undefined {
  if (!(error instanceof Error) || (error.message !== SLOT_CHOICE_REQUIRED && error.message !== SLOT_CHANGED)) return undefined;
  const details = (error as { details?: Partial<SlotChoiceDetails> }).details;
  return Array.isArray(details?.slots) && typeof details.unplaced === 'number'
    ? { slots: details.slots, unplaced: details.unplaced }
    : undefined;
}

/** The details of a 409 that asks which cells to name ("Quelles cases libérer ?"). */
export function cellsToNameOf(error: unknown): SlotsToFreeDetails | undefined {
  if (!(error instanceof Error) || error.message !== SLOTS_TO_FREE_REQUIRED) return undefined;
  const details = (error as { details?: Partial<SlotsToFreeDetails> }).details;
  return Array.isArray(details?.slots) && typeof details.needed === 'number'
    ? { slots: details.slots, needed: details.needed }
    : undefined;
}

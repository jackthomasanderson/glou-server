// #471 (FEAT-104, ux-ui.md §10.4.2, decision #471 points 13 and 43): which
// line a bottle (a box, a cigar) is taken from when a wine is spread over
// several groups. Pure, shared by the web (the "Quelles bouteilles ?" dialog)
// and the API (bulk "Marquer comme bus", guests). Import only from shared/.

import { isIntactItem, itemUnits, type UnitState } from './units';

/** A line of a wine, as read to choose among them. */
export interface ChoiceLine extends UnitState {
  id: string;
  cellarId: string | null;
  purchasePrice: number | null;
  /** A day (`YYYY-MM-DD` on the wire, midnight UTC on the API). */
  purchasedAt: Date | string | null;
  deletedAt?: Date | string | null;
}

/**
 * Why a line is preselected, said in words next to it: the cellar looked at,
 * bought first, the cheapest, the largest; null when nothing tells the lines
 * apart or there is only one.
 */
export type PreselectReason = 'cellar' | 'oldest' | 'cheapest' | 'largest';

export interface Preselection<T> {
  line: T;
  reason: PreselectReason | null;
}

/** The groups a copy can be taken from: intact, in stock, out of the trash. */
export function openableGroups<T extends ChoiceLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => line.deletedAt == null && isIntactItem(line) && itemUnits(line) > 0);
}

const dayOf = (value: Date | string | null): string | null =>
  value == null ? null : (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);

/** Known before unknown: a line without a purchase day or a price is not "the oldest" nor "the cheapest". */
function knownFirst<V extends string | number>(a: V | null, b: V | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * The price of one unit: a bottle, or one cigar — a box's price spread over
 * its cigars, so a box at 250 € (25 cigars) and a single cigar at 12 € compare.
 */
const unitPrice = (line: ChoiceLine): number | null =>
  line.purchasePrice == null ? null : line.purchasePrice / (line.cigarsPerBox ?? 1);

/** The criteria in order, each one read only when the previous ones tie. */
const CRITERIA: ReadonlyArray<[Exclude<PreselectReason, 'cellar'>, (a: ChoiceLine, b: ChoiceLine) => number]> = [
  ['oldest', (a, b) => knownFirst(dayOf(a.purchasedAt), dayOf(b.purchasedAt))],
  ['cheapest', (a, b) => knownFirst(unitPrice(a), unitPrice(b))],
  // Counted in units (bottles, cigars): 3 boxes of 25 are more than 10 single cigars.
  ['largest', (a, b) => itemUnits(b) - itemUnits(a)],
];

/**
 * The group preselected among a wine's lines (FEAT-104):
 * 1. the groups of the cellar being looked at (`cellarIds`: the list filtered
 *    on a cellar, a cellar's page), when it holds some but not all;
 * 2. among them, the one bought first (a known day before an unknown one);
 * 3. same day, or no day: the cheapest unit, a bottle or a cigar (a known
 *    price before none);
 * 4. same price: the largest group, in units (bottles, cigars).
 * Opened, finished and written-off copies are never chosen. Null when the
 * wine has no group in stock.
 */
export function preselectGroup<T extends ChoiceLine>(
  lines: readonly T[],
  options: { cellarIds?: readonly string[] } = {},
): Preselection<T> | null {
  const groups = openableGroups(lines);
  if (groups.length === 0) return null;
  const looked = new Set(options.cellarIds ?? []);
  const here = groups.filter((group) => group.cellarId != null && looked.has(group.cellarId));
  const narrowed = here.length > 0 && here.length < groups.length;
  const pool = narrowed ? here : groups;

  const compare = (a: ChoiceLine, b: ChoiceLine) => {
    for (const [, criterion] of CRITERIA) {
      const order = criterion(a, b);
      if (order !== 0) return order;
    }
    return 0;
  };
  // Stable: lines nothing tells apart keep the order they were given in.
  const [best, next] = [...pool].sort(compare);
  if (narrowed) return { line: best, reason: 'cellar' };
  if (!next) return { line: best, reason: null };
  const decisive = CRITERIA.find(([, criterion]) => criterion(best, next) !== 0);
  return { line: best, reason: decisive ? decisive[0] : null };
}

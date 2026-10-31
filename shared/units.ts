// #471 (FEAT-92/95/96): the single counting rule for units, value and spending,
// and the identity of a family (`productKey`) and of a group (`groupKey`).
// design.md glossary: Unités, Prix d'achat / Valeur estimée, Intact, Identité
// d'un groupe, Famille identique. Pure functions, used by the API and the web;
// the families transformation re-implements `itemUnits`, `itemSpend` and
// `productKey` once in SQL, checked against the same cases
// (e2e/migration/fixtures/units-cases.json). Import only from shared/.

import type { InventoryCategory } from './inventory';

/** A day (`purchasedAt`), as the API's Date or the wire's ISO string. */
type DayValue = Date | string | null;

/** What a unit's state and size are read from. */
export interface UnitState {
  quantity: number | null;
  isOpened: boolean;
  fillLevel: number | null;
  cigarsPerBox: number | null;
  cigarsLeft: number | null;
  writtenOffAt: DayValue;
}

export interface UnitPrices {
  purchasePrice: number | null;
  estimatedValue: number | null;
}

/** Bottles (wine, sparkling, spirit) are counted in bottles, cigars in cigars. */
export type UnitKind = 'bottle' | 'cigar';

export function unitKind(category: InventoryCategory): UnitKind {
  return category === 'cigar' ? 'cigar' : 'bottle';
}

/** Opened and empty: drunk, or a box smoked to its last cigar. */
export function isFinishedState(item: Pick<UnitState, 'isOpened' | 'fillLevel'>): boolean {
  return item.isOpened && item.fillLevel === 0;
}

/**
 * Intact: a closed full bottle, or a closed complete box. The only criterion
 * between a group and a sub-record (only an intact unit can count more than one).
 */
export function isIntactItem(item: Pick<UnitState, 'isOpened' | 'fillLevel' | 'cigarsLeft'>): boolean {
  return !item.isOpened && (item.fillLevel == null || item.fillLevel === 100) && item.cigarsLeft == null;
}

/** Copies held: a group's `quantity` (1 when empty), 1 for a sub-record, 0 once finished or written off. */
function copiesInStock(item: UnitState): number {
  if (item.writtenOffAt != null || isFinishedState(item)) return 0;
  if (item.isOpened) return 1;
  return Math.max(item.quantity ?? 1, 0);
}

/**
 * Units in stock: bottles of a group (`quantity`), cigars of a group of boxes
 * (`quantity × cigarsPerBox`) or of single cigars (`quantity`), 1 bottle or
 * `cigarsLeft` cigars for an opened sub-record, 0 once finished or written off.
 * The trash is left to the caller's scope (IN_STOCK_ITEM_FILTER, `summarizeStock`).
 */
export function itemUnits(item: UnitState): number {
  const copies = copiesInStock(item);
  if (copies === 0) return 0;
  if (item.isOpened) return item.cigarsLeft ?? 1;
  return item.cigarsPerBox != null ? copies * item.cigarsPerBox : copies;
}

/**
 * Value rule (#594): the value of one copy (bottle, box, single cigar) is its
 * estimated value, else its purchase price, else 0; an opened bottle or box
 * keeps its whole value; finished or written off is worth nothing.
 */
export function itemValue(item: UnitState & UnitPrices): number {
  return (item.estimatedValue ?? item.purchasePrice ?? 0) * copiesInStock(item);
}

/**
 * Spending: the purchase price of every copy bought, drunk and written-off
 * ones included (only an "input error" correction lowers `quantity`).
 */
export function itemSpend(item: Pick<UnitState, 'quantity'> & Pick<UnitPrices, 'purchasePrice'>): number {
  return (item.purchasePrice ?? 0) * Math.max(item.quantity ?? 1, 0);
}

/** Same normalisation as the former `isDuplicateOf`; SQL: lower(btrim(…)). */
const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export interface ProductKeyFields {
  category: InventoryCategory;
  producer: string;
  name: string;
  vintage: number | null;
  format: string | null;
}

/**
 * "Famille identique": same category, producer, name and vintage — the vitola
 * (`format`) instead of the vintage for a cigar. An empty vintage or vitola is
 * a value of its own ("no year" ≠ 2020, D26). The bottle size is not part of it.
 */
export function productKey(product: ProductKeyFields): string {
  const distinguisher = product.category === 'cigar' ? normalize(product.format) : (product.vintage ?? '');
  return JSON.stringify([product.category, normalize(product.producer), normalize(product.name), distinguisher]);
}

export interface GroupKeyFields {
  productId: string;
  cellarId: string | null;
  purchasePrice: number | null;
  purchasedAt: DayValue;
  bottleSize: string | null;
  cigarsPerBox: number | null;
}

/** `YYYY-MM-DD` of a `@db.Date` day (stored as midnight UTC), never a local Date (D6). */
function dayOf(value: DayValue): string | null {
  if (value == null) return null;
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

/**
 * Identity of a group (D5): family, cellar, purchase price, purchase day and
 * size — the normalised bottle size, or the box size for cigars (empty = single
 * cigars). Empty equals empty; an empty price differs from 0. Two units belong
 * to the same group only if both are also groupable ({@link isGroupableItem}).
 */
export function groupKey(item: GroupKeyFields, kind: UnitKind): string {
  const size = kind === 'cigar' ? item.cigarsPerBox : normalize(item.bottleSize);
  return JSON.stringify([item.productId, item.cellarId, item.purchasePrice, dayOf(item.purchasedAt), size]);
}

/** Intact, out of the trash and not written off: can join or form a group. */
export function isGroupableItem(
  item: Pick<UnitState, 'isOpened' | 'fillLevel' | 'cigarsLeft' | 'writtenOffAt'> & { deletedAt: DayValue },
): boolean {
  return isIntactItem(item) && item.deletedAt == null && item.writtenOffAt == null;
}

export interface StockSummary {
  /** Units in stock, everywhere. */
  units: number;
  /** Units in stock in `cellarId`, when one was given ("2 ici · 9 en tout"). */
  unitsHere?: number;
  /** Units of intact groups (full bottles, cigars of closed boxes and single cigars). */
  intactUnits: number;
  /** Closed boxes, and single cigars, of intact cigar groups. */
  closedBoxes: number;
  singleCigars: number;
  /** Opened sub-records in stock: bottles (with their fill level) or boxes. */
  opened: Array<{ fillLevel: number | null; cigarsLeft: number | null }>;
  /** {@link itemValue} summed. */
  value: number;
}

/** Summary of a family's stock (its card line), over the units in stock only. */
export function summarizeStock(
  items: ReadonlyArray<UnitState & UnitPrices & { cellarId: string | null; deletedAt: DayValue }>,
  options: { kind: UnitKind; cellarId?: string },
): StockSummary {
  const summary: StockSummary = { units: 0, intactUnits: 0, closedBoxes: 0, singleCigars: 0, opened: [], value: 0 };
  if (options.cellarId !== undefined) summary.unitsHere = 0;
  for (const item of items) {
    const units = item.deletedAt == null ? itemUnits(item) : 0;
    if (units === 0) continue;
    summary.units += units;
    summary.value += itemValue(item);
    if (summary.unitsHere !== undefined && item.cellarId === options.cellarId) summary.unitsHere += units;
    if (item.isOpened) {
      summary.opened.push({ fillLevel: item.fillLevel, cigarsLeft: item.cigarsLeft });
      continue;
    }
    summary.intactUnits += units;
    if (options.kind !== 'cigar') continue;
    if (item.cigarsPerBox != null) summary.closedBoxes += copiesInStock(item);
    else summary.singleCigars += units;
  }
  return summary;
}

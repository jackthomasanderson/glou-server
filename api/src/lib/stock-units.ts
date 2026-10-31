import type { Prisma } from '@prisma/client';
import { itemUnits, itemValue, unitKind } from './finished-item';
import type { InventoryCategory } from '../../../shared/inventory';
import type { UnitPrices, UnitState } from '../../../shared/units';

/**
 * #471 (FEAT-96): what a unit row must carry for `itemUnits`, `itemValue` and
 * `itemSpend` (shared/units.ts). Every count, value or spending figure reads
 * these columns and goes through those functions: a row is a group of N
 * copies, so `COUNT(*)` over units is never a number of bottles.
 */
export const UNIT_COUNT_SELECT = {
  quantity: true,
  isOpened: true,
  fillLevel: true,
  cigarsPerBox: true,
  cigarsLeft: true,
  writtenOffAt: true,
  purchasePrice: true,
  estimatedValue: true,
} satisfies Prisma.InventoryItemSelect;

/** The same, plus the family's category, which decides bottles or cigars. */
export const UNIT_TOTALS_SELECT = {
  ...UNIT_COUNT_SELECT,
  product: { select: { category: true } },
} satisfies Prisma.InventoryItemSelect;

/**
 * A row read with {@link UNIT_TOTALS_SELECT} (the money columns come back as
 * numbers, lib/prisma.ts).
 */
export type UnitTotalsRow = UnitState & UnitPrices & { product: { category: InventoryCategory } };

/** Bottles (wine, sparkling, spirit) and cigars in stock, and their value (#594). */
export interface UnitTotals {
  bottles: number;
  cigars: number;
  value: number;
}

export function emptyTotals(): UnitTotals {
  return { bottles: 0, cigars: 0, value: 0 };
}

/** Adds one unit row to `totals` (finished and written-off rows add nothing). */
export function addToTotals(totals: UnitTotals, row: UnitTotalsRow): UnitTotals {
  const units = itemUnits(row);
  if (unitKind(row.product.category) === 'cigar') totals.cigars += units;
  else totals.bottles += units;
  totals.value += itemValue(row);
  return totals;
}

export function sumTotals(rows: readonly UnitTotalsRow[]): UnitTotals {
  return rows.reduce(addToTotals, emptyTotals());
}

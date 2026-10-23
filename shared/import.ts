// #466: CSV import contracts (FEAT-56) shared by api/ and web/. Import only from shared/.
import type { InventoryCategory } from './inventory';

/** A CSV row once validated: returned by /preview, sent back to /confirm. */
export interface CsvImportRow {
  name: string;
  producer: string;
  category: InventoryCategory;
  vintage?: number;
  // #510: optional columns.
  purchasePrice?: number;
  region?: string;
  quantity?: number;
  alcoholDegree?: number;
}

export interface CsvImportError {
  /** 1-based row number as a spreadsheet shows it (header = row 1). */
  row: number;
  /** Error code, e.g. INVALID_CATEGORY. */
  reason: string;
}

export interface CsvImportPreview {
  valid: CsvImportRow[];
  errors: CsvImportError[];
}

/**
 * FEAT-91: most items one import creates — the former 500-row cap, from when
 * a row was always one item. Bounds the single all-or-nothing transaction. A
 * larger file is refused at preview, never cut short without a word (#641).
 */
export const CSV_IMPORT_MAX_ITEMS = 500;

/**
 * FEAT-91 (#577): how many inventory items a row becomes. design.md glossary:
 * one item per bottle, so a wine row with quantity 6 is 6 items; a cigar item
 * is a box, and its quantity is the number of cigars in it.
 */
export function csvRowItemCount(row: Pick<CsvImportRow, 'category' | 'quantity'>): number {
  return row.category === 'cigar' ? 1 : row.quantity ?? 1;
}

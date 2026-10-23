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

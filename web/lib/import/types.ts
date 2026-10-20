// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Mirrors api/src/schemas/import.schema.ts. CSV-only in this feature —
// Excel/.xlsx is an explicitly assumed limitation, not an oversight.

import type { InventoryCategory } from '../inventory/types';

// ISSUE_137: alias of the single category source, not an independent list.
export type ImportCategory = InventoryCategory;

export interface CsvImportRow {
  name: string;
  producer: string;
  category: ImportCategory;
  vintage?: number;
  // #510: optional columns.
  purchasePrice?: number;
  region?: string;
  quantity?: number;
  alcoholDegree?: number;
}

export interface CsvImportError {
  row: number;
  reason: string;
}

export interface CsvImportPreview {
  valid: CsvImportRow[];
  errors: CsvImportError[];
}

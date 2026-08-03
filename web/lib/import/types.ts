// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Mirrors api/src/schemas/import.schema.ts. CSV-only in this feature —
// Excel/.xlsx is an explicitly assumed limitation, not an oversight.

export type ImportCategory = 'wine' | 'sparkling' | 'spirit' | 'cigar';

export interface CsvImportRow {
  name: string;
  producer: string;
  category: ImportCategory;
  vintage?: number;
}

export interface CsvImportError {
  row: number;
  reason: string;
}

export interface CsvImportPreview {
  valid: CsvImportRow[];
  errors: CsvImportError[];
}

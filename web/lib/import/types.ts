// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// #466: the contracts are declared once, in shared/import.ts. CSV-only in this
// feature — Excel/.xlsx is an explicitly assumed limitation, not an oversight.
export type {
  CsvImportChoice, CsvImportError, CsvImportLine, CsvImportPreview, CsvImportResult, CsvImportRow,
} from '@shared/import';

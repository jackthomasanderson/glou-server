-- FEAT-05: Transparence des Sources et Historique des Modifications
-- Adds per-field source tagging to inventory items. Absence of an entry for
-- a given field is treated as 'manual' by the application layer — this
-- column only ever needs to carry non-manual tags ('ocr' | 'import_csv' |
-- 'enrichment') going forward.

-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "fieldSources" JSONB;

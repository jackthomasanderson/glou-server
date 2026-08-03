-- Data-model audit (Task 3): spirit collector fields.
--
-- `lotNumber`/`batchDate`/`caskType` already existed on `bottles`:
--   * `lotNumber` was validated for both 'wine' and 'spirit' in
--     inventory.schema.ts but only ever rendered in InventoryForm.tsx for
--     category='wine'.
--   * `batchDate` existed in the DB since the very first migration
--     (20260307000000_init) but was completely dead — no zod schema, no
--     form field, for ANY category.
--   * `caskType` was already exposed for 'spirit' in the form's general
--     "show more" optionals (ungated) — moved into the new expert-only
--     "fût / batch" section alongside the fields below for a single
--     coherent group, see InventoryForm.tsx.
--
-- `isSingleCask`/`caskNumber`/`caskProof` are net-new, single-cask-specific
-- fields requested by the audit. All nullable — never required, and only
-- ever rendered behind User.expertMode.

ALTER TABLE "bottles"
  ADD COLUMN "isSingleCask" BOOLEAN,
  ADD COLUMN "caskNumber" TEXT,
  ADD COLUMN "caskProof" DOUBLE PRECISION;

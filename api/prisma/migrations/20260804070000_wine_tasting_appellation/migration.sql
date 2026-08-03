-- Data-model audit (Task 2): structured wine tasting grid + appellation/
-- classification.
--
-- The tasting grid (robe/nez/bouche/tanin/acidité/longueur) is added to
-- `tasting_notes` rather than `bottles` — a tasting perception is tied to a
-- specific tasting EVENT (`tastedAt`), not a permanent property of the
-- bottle, exactly like `rating`/`readiness`/`notes` already on this table.
--
-- `appellation`/`classification`, by contrast, ARE static characteristics of
-- the wine itself (like `region`), so they land on `bottles` next to it.
--
-- All columns are nullable/optional — never required, and only ever
-- rendered in the UI behind User.expertMode (see TastingForm.tsx /
-- InventoryForm.tsx).

ALTER TABLE "tasting_notes"
  ADD COLUMN "robe" TEXT,
  ADD COLUMN "nez" TEXT,
  ADD COLUMN "bouche" TEXT,
  ADD COLUMN "tanin" INTEGER,
  ADD COLUMN "acidite" INTEGER,
  ADD COLUMN "longueurBouche" INTEGER;

ALTER TABLE "bottles"
  ADD COLUMN "appellation" TEXT,
  ADD COLUMN "classification" TEXT;

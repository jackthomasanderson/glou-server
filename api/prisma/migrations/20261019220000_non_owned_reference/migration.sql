-- FEAT-87: a non-owned reference is an item described without being
-- possessed. DEFAULT true backfills every existing row as owned, so the
-- migration changes no behaviour on its own.
ALTER TABLE "bottles" ADD COLUMN "isOwned" BOOLEAN NOT NULL DEFAULT true;

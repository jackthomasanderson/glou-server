-- #573: a finished bottle (opened, fill level 0) gives its cellar-map grid
-- slot back. The map no longer shows finished bottles, so a slot one still
-- held looked empty yet refused every other bottle through the partial unique
-- index "bottles_cellar_slot_unique". The application now clears the slot
-- whenever it writes the finished state; this frees the slots of bottles
-- finished before that change.
--
-- Trashed rows are included, so a finished bottle restored from the trash
-- comes back unplaced. "updatedAt" is deliberately left untouched: this is a
-- maintenance write, not a user edit, and offline sync detects conflicts by
-- comparing it.
UPDATE "bottles"
SET "slotColumn" = NULL, "slotRow" = NULL
WHERE "isOpened" = true
  AND "fillLevel" = 0
  AND ("slotColumn" IS NOT NULL OR "slotRow" IS NOT NULL);

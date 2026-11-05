-- FEAT-93 migration bench: what the slots migration must have made of
-- fixtures/before-slots.sql (and of the slots the families fixture kept),
-- then the schema it leaves. Every failed expectation is listed, then the
-- script fails.

CREATE TEMP TABLE failures (what TEXT);

CREATE FUNCTION pg_temp.expect(ok BOOLEAN, what TEXT) RETURNS VOID AS $$
BEGIN
  IF ok IS NOT TRUE THEN
    INSERT INTO failures VALUES (what);
    RAISE WARNING 'FAILED: %', what;
  ELSE
    RAISE NOTICE 'ok: %', what;
  END IF;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.id(n TEXT) RETURNS TEXT AS $$
  SELECT '00000000-0000-4000-8000-' || lpad(n, 12, '0')
$$ LANGUAGE sql;

-- A unit's cells, "column:row" in order, live ones only; '' when none.
CREATE FUNCTION pg_temp.cells(n TEXT) RETURNS TEXT AS $$
  SELECT coalesce(string_agg("column" || ':' || "row", ' ' ORDER BY "row", "column"), '')
  FROM "item_slots" WHERE "itemId" = pg_temp.id(n) AND "deletedAt" IS NULL
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Criterion 5: every cell occupied before is still occupied by the same
-- bottles, and identical groups each in a cell are one group holding both.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT "quantity" = 6 FROM "bottles" WHERE "id" = pg_temp.id('811'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" IN (pg_temp.id('812'), pg_temp.id('813')))
  AND pg_temp.cells('811') = '1:1 2:1',
  'c5: two identical groups in a cell each and an unplaced one are one group x6 holding both cells');
SELECT pg_temp.expect(
  (SELECT "parentItemId" = pg_temp.id('811') AND "isOpened" AND "fillLevel" = 40 FROM "bottles" WHERE "id" = pg_temp.id('814'))
  AND pg_temp.cells('814') = '3:1',
  'c5: an opened sub-record keeps its own cell and points at the surviving group');
SELECT pg_temp.expect(
  (SELECT "itemId" = pg_temp.id('811') FROM "tasting_notes" WHERE "id" = pg_temp.id('8d1'))
  AND (SELECT "acquiredItemId" = pg_temp.id('811') FROM "wishlist_items" WHERE "id" = pg_temp.id('8a1'))
  AND EXISTS (SELECT 1 FROM "audit_logs" WHERE "bottleId" = pg_temp.id('811')
              AND "details" ->> 'absorbedFrom' = pg_temp.id('812')),
  'c5: tastings, wishlist links and history follow the absorbed group (history says where from)');
SELECT pg_temp.expect(
  pg_temp.cells('b1') = '1:1' AND pg_temp.cells('301') = '2:1'
  AND (SELECT "quantity" = 6 FROM "bottles" WHERE "id" = pg_temp.id('601'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" IN (pg_temp.id('604'), pg_temp.id('605')))
  AND pg_temp.cells('601') = '4:1 5:1',
  'c5: the cells kept by the families migration are kept; 604 and 605, left apart for their cell, join 601');

-- ---------------------------------------------------------------------------
-- Cigars: one cell for a group of single cigars, one per box.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT "quantity" = 7 FROM "bottles" WHERE "id" = pg_temp.id('821'))
  AND (SELECT "quantity" = 3 FROM "bottles" WHERE "id" = pg_temp.id('822'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" = pg_temp.id('823'))
  AND pg_temp.cells('821') = '1:2' AND pg_temp.cells('822') = '2:2',
  'single cigars: two groups each in a cell stay apart, an unplaced one joins the first');
SELECT pg_temp.expect(
  (SELECT "quantity" = 3 FROM "bottles" WHERE "id" = pg_temp.id('831'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" = pg_temp.id('832'))
  AND pg_temp.cells('831') = '1:3 2:3',
  'boxes: two placed groups of boxes fuse, 3 boxes in 2 cells');

-- ---------------------------------------------------------------------------
-- #174 and the coordinates left behind.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM "item_slots" s JOIN "bottles" b ON b."id" = s."itemId"
   WHERE s."itemId" = pg_temp.id('841') AND s."column" = 1 AND s."row" = 4 AND s."deletedAt" = b."deletedAt")
  AND pg_temp.cells('842') = '1:4',
  '#174: a unit in the trash keeps its cell in the trash with it, live for the unit that took it since');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "item_slots" WHERE "itemId" IN
    (pg_temp.id('851'), pg_temp.id('852'), pg_temp.id('853'), pg_temp.id('854'), pg_temp.id('503'))),
  'no slot for coordinates without a cellar, half filled, out of range, or on a finished unit');
SELECT pg_temp.expect(
  (SELECT "quantity" = 2 FROM "bottles" WHERE "id" = pg_temp.id('861'))
  AND (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('862'))
  AND pg_temp.cells('861') = '1:6' AND pg_temp.cells('862') = '2:6'
  AND (SELECT "foundQuantity" = 1 FROM "inventory_count_entries" WHERE "id" = pg_temp.id('8f2')),
  'two groups counted in one session stay apart; the one an unplaced group joins says it found 1');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "item_slots") = 16,
  'every cell kept is one slot: 4 from the families fixture, 12 from the slots fixture');

-- ---------------------------------------------------------------------------
-- The schema left: the columns are gone, the table, its keys and the guard are there.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
              AND table_name = 'bottles' AND column_name IN ('slotColumn', 'slotRow'))
  AND to_regclass('bottles_cellar_slot_unique') IS NULL,
  'bottles.slotColumn, slotRow and their unique index are gone');
SELECT pg_temp.expect(
  to_regclass('item_slots_cell_unique') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_slots_itemId_cellarId_fkey')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_slots_cell_range')
  AND (SELECT count(*) = 2 FROM pg_trigger WHERE tgname IN ('item_slots_guard', 'item_slots_guard_unit')
       AND tgdeferrable AND tginitdeferred),
  'item_slots has its live-cell unique index, its key to the unit and cellar, its range, and the deferred guard');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'fam\_%' OR proname LIKE 'slot\_%'),
  'the migration''s temporary functions are gone');

DO $$
DECLARE
  failed TEXT;
BEGIN
  SELECT string_agg(what, E'\n  ') INTO failed FROM failures;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'slots transform bench failed:\n  %', failed;
  END IF;
END $$;

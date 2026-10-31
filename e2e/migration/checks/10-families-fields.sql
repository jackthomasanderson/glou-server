-- #471 migration bench: where the fields of fixtures/before-families.sql live
-- once the families migrations have run (expand, then transform), and the
-- database rules of the new tables. The grouping itself is checked by
-- 20-families-transform.sql. Every failed expectation is listed, then the
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

-- 'b1' -> 00000000-0000-4000-8000-0000000000b1, '101' -> ...000000000101
CREATE FUNCTION pg_temp.id(n TEXT) RETURNS TEXT AS $$
  SELECT '00000000-0000-4000-8000-' || lpad(n, 12, '0')
$$ LANGUAGE sql;

-- Every unit belongs to a family and mirrors its description (the copy kept
-- on bottles until the end of the families work).
SELECT pg_temp.expect(
  NOT EXISTS (
    SELECT 1
    FROM "bottles" b JOIN "products" p ON p."id" = b."productId",
         jsonb_each(to_jsonb(p)) AS col(key, value)
    WHERE col.key NOT IN ('id', 'userId', 'otherPhotoUrls', 'updatedBy', 'lockedFields', 'fieldSources',
                          'deletedAt', 'createdAt', 'updatedAt')
      AND col.value IS DISTINCT FROM to_jsonb(b) -> col.key
  ),
  'every unit mirrors the description, alerts, photo, notes and tags of its family');

SELECT pg_temp.expect(
  (SELECT "region" = 'Bordeaux' AND "grapeVarieties" = '{Merlot,"Cabernet Sauvignon"}' AND "tags" = '{gift,bordeaux}'
     AND "collection" = 'Old label' AND "curveShape" = 'BELL' AND "alertStatus" = 'peak'
     AND "updatedBy" = pg_temp.id('a2') AND "userId" = pg_temp.id('a1')
   FROM "products" WHERE "id" = pg_temp.id('b1')),
  'b1: the Talbot family carries its region, grapes, tags, label, curve and authors');
SELECT pg_temp.expect(
  (SELECT NOT "alertsPaused" FROM "products" WHERE "id" = pg_temp.id('b1')),
  'b1: alerts paused on b1 only are not paused for the family (D3)');
SELECT pg_temp.expect(
  (SELECT "lotNumber" = 'L123' AND "caskNumber" = '4512' AND "isSingleCask" AND "caskProof" = 56.1
     AND "batchDate" = '2019-05-01' AND "edition" = 'Distillers Edition'
   FROM "products" WHERE "id" = pg_temp.id('301')),
  'b4: its technical sheet is on the Lagavulin family it joined');
SELECT pg_temp.expect(
  (SELECT "format" = 'Cañonazo' AND "factoryCode" = 'EMS' AND "manufactureYear" = 2021
   FROM "products" WHERE "id" = pg_temp.id('b5')),
  'b5: the cigar sheet is on the family');

-- Locks and sources: the family keeps its own fields only, the record is untouched.
SELECT pg_temp.expect(
  (SELECT "lockedFields" = '{name,region}' FROM "products" WHERE "id" = pg_temp.id('b1')),
  'b1: the family keeps its own locks, in order');
SELECT pg_temp.expect(
  (SELECT "fieldSources" = '{"name": "ocr", "vintage": "ocr"}' FROM "products" WHERE "id" = pg_temp.id('b1')),
  'b1: the family keeps its own field sources');
SELECT pg_temp.expect(
  (SELECT "fieldSources" = '{"name": "ocr", "purchasePrice": "import_csv", "vintage": "ocr"}'
     AND "lockedFields" = '{name,purchasePrice,region}'
   FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'b1: the record keeps its locks and sources');
SELECT pg_temp.expect(
  (SELECT "fieldSources" IS NULL FROM "products" WHERE "id" = pg_temp.id('301')),
  'b4: a JSON null as sources gives no source to the family it joins');

-- D6: purchase day = creation day in Europe/Paris.
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-01-15' FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'b1: created 23:30 UTC in winter, bought the next day in Paris');
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-07-02' FROM "bottles" WHERE "id" = pg_temp.id('b2')),
  'b2: created 22:30 UTC in summer, bought the next day in Paris');
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-07-01' FROM "bottles" WHERE "id" = pg_temp.id('b3')),
  'b3: created 21:30 UTC in summer, bought the same day in Paris');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM "bottles" WHERE "purchasedAt" IS NULL),
  'every unit has a purchase day');

SELECT pg_temp.expect(
  (SELECT "updatedAt" = '2026-02-01 10:00:00' AND "slotColumn" = 1 AND "slotRow" = 1
     AND "cellarId" = pg_temp.id('c1') AND "purchasePrice" = 20.00 AND "estimatedValue" = 35.50
   FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'b1: last change date, slot, cellar and prices are unchanged');
SELECT pg_temp.expect(
  (SELECT "deletedAt" = '2026-10-25 08:00:00' FROM "bottles" WHERE "id" = pg_temp.id('b4')),
  'b4: the record stays in the trash');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM "bottles" WHERE "writtenOffAt" IS NOT NULL),
  'nothing is written off');

-- Tastings and history.
SELECT pg_temp.expect(
  (SELECT "productId" = pg_temp.id('b1') AND "itemId" = pg_temp.id('b1') AND "guestName" IS NULL
   FROM "tasting_notes" WHERE "id" = pg_temp.id('d1')),
  'a tasting is on the family of its bottle');
SELECT pg_temp.expect(
  (SELECT "productId" IS NULL AND "itemId" IS NULL FROM "tasting_notes" WHERE "id" = pg_temp.id('d3')),
  'an orphan tasting stays without a family');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "audit_logs" a JOIN "bottles" b ON b."id" = a."bottleId"
              WHERE a."productId" IS DISTINCT FROM b."productId")
  AND (SELECT "productId" IS NULL FROM "audit_logs" WHERE "action" = 'LOGIN'),
  'history lines are on the family of their bottle, the others stay without one');
SELECT pg_temp.expect(
  (SELECT "itemId" = pg_temp.id('b1') AND "foundQuantity" IS NULL
   FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f2')),
  'an inventory count entry is unchanged, with no found quantity');
SELECT pg_temp.expect(
  (SELECT "acquiredItemId" = pg_temp.id('b3') FROM "wishlist_items" WHERE "id" = pg_temp.id('ab')),
  'a wishlist link is unchanged');

-- D10 and the distinction pair rule, on the real constraints.
DO $$
BEGIN
  DELETE FROM "products" WHERE "id" = pg_temp.id('b1');
  PERFORM pg_temp.expect(false, 'a family with units cannot be deleted');
EXCEPTION WHEN foreign_key_violation THEN
  PERFORM pg_temp.expect(true, 'a family with units cannot be deleted');
END $$;
DO $$
BEGIN
  INSERT INTO "product_distinctions" ("productId", "otherProductId") VALUES (pg_temp.id('b3'), pg_temp.id('b1'));
  PERFORM pg_temp.expect(false, 'a distinction pair is stored smallest id first');
EXCEPTION WHEN check_violation THEN
  PERFORM pg_temp.expect(true, 'a distinction pair is stored smallest id first');
END $$;
DO $$
DECLARE
  gone BOOLEAN;
BEGIN
  BEGIN
    INSERT INTO "product_distinctions" ("productId", "otherProductId") VALUES (pg_temp.id('b1'), pg_temp.id('b3'));
    DELETE FROM "bottles" WHERE "productId" = pg_temp.id('b3');
    DELETE FROM "products" WHERE "id" = pg_temp.id('b3');
    gone := NOT EXISTS (SELECT 1 FROM "product_distinctions");
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN raise_exception THEN
    NULL; -- everything above is rolled back; `gone` keeps its value
  END;
  PERFORM pg_temp.expect(gone, 'a distinction goes away with either family');
END $$;

DO $$
DECLARE
  failed TEXT;
BEGIN
  SELECT string_agg(what, E'\n  ') INTO failed FROM failures;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'families fields bench failed:\n  %', failed;
  END IF;
END $$;

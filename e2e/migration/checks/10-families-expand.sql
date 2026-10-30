-- #471 migration bench: what the families_expand migration must have done
-- to fixtures/before-families.sql. Every failed expectation is listed, then
-- the script fails.

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
  SELECT '00000000-0000-4000-8000-0000000000' || n
$$ LANGUAGE sql;

-- One family per record, same id.
SELECT pg_temp.expect((SELECT count(*) FROM "products") = 6, 'six records give six families');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM "bottles" WHERE "productId" IS DISTINCT FROM "id"),
  'each record belongs to the family with its own id');

-- Every family column also present on bottles holds the record's value,
-- except the ones the expansion filters or leaves empty on purpose.
SELECT pg_temp.expect(
  NOT EXISTS (
    SELECT 1
    FROM "products" p JOIN "bottles" b ON b."id" = p."id",
         jsonb_each(to_jsonb(p)) AS col(key, value)
    WHERE col.key NOT IN ('lockedFields', 'fieldSources', 'deletedAt', 'otherPhotoUrls')
      AND col.value IS DISTINCT FROM to_jsonb(b) -> col.key
  ),
  'the description, alerts, photo, notes, tags and audit fields are copied as they were');
SELECT pg_temp.expect(
  (SELECT "region" = 'Bordeaux' AND "grapeVarieties" = '{Merlot,"Cabernet Sauvignon"}' AND "tags" = '{gift,bordeaux}'
     AND "collection" = 'Old label' AND "alertsPaused" AND "curveShape" = 'BELL' AND "alertStatus" = 'peak'
     AND "updatedBy" = pg_temp.id('a2') AND "userId" = pg_temp.id('a1')
   FROM "products" WHERE "id" = pg_temp.id('b1')),
  'b1: the family carries its region, grapes, tags, label, alerts and authors');
SELECT pg_temp.expect(
  (SELECT "lotNumber" = 'L123' AND "caskNumber" = '4512' AND "isSingleCask" AND "caskProof" = 56.1
     AND "batchDate" = '2019-05-01'
   FROM "products" WHERE "id" = pg_temp.id('b4')),
  'b4: the technical sheet is on the family');
SELECT pg_temp.expect(
  (SELECT "format" = 'Cañonazo' AND "factoryCode" = 'EMS' AND "manufactureYear" = 2021
   FROM "products" WHERE "id" = pg_temp.id('b5')),
  'b5: the cigar sheet is on the family');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "products" WHERE "deletedAt" IS NOT NULL OR "otherPhotoUrls" <> '{}'),
  'no family is in the trash and none has other photos');

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
  (SELECT "fieldSources" IS NULL FROM "products" WHERE "id" = pg_temp.id('b4')),
  'b4: a JSON null as sources gives a family without sources');

-- D6: purchase day = creation day in Europe/Paris.
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-01-15' FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'b1: created 23:30 UTC in winter, bought the next day in Paris');
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-07-02' FROM "bottles" WHERE "id" = pg_temp.id('b2')),
  'b2: created 22:30 UTC in summer, bought the next day in Paris');
SELECT pg_temp.expect((SELECT "purchasedAt" = '2026-07-01' FROM "bottles" WHERE "id" = pg_temp.id('b3')),
  'b3: created 21:30 UTC in summer, bought the same day in Paris');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM "bottles" WHERE "purchasedAt" IS NULL),
  'every record has a purchase day');

-- The records themselves are unchanged (no grouping, no split at this step).
SELECT pg_temp.expect(
  (SELECT "updatedAt" = '2026-02-01 10:00:00' AND "slotColumn" = 1 AND "slotRow" = 1
     AND "cellarId" = pg_temp.id('c1') AND "purchasePrice" = 20.00 AND "estimatedValue" = 35.50
   FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'b1: last change date, slot, cellar and prices are unchanged');
SELECT pg_temp.expect(
  (SELECT "quantity" = 6 AND "isOpened" AND "fillLevel" = 0 FROM "bottles" WHERE "id" = pg_temp.id('b2')),
  'b2: the finished record keeps its count and state');
SELECT pg_temp.expect(
  (SELECT "quantity" = 25 AND "isOpened" AND "cigarsPerBox" IS NULL AND "cigarsLeft" IS NULL
   FROM "bottles" WHERE "id" = pg_temp.id('b5')),
  'b5: the cigar box is not converted yet');
SELECT pg_temp.expect(
  (SELECT "deletedAt" = '2026-10-25 08:00:00' FROM "bottles" WHERE "id" = pg_temp.id('b4')),
  'b4: the record stays in the trash');
SELECT pg_temp.expect(
  (SELECT NOT "isOwned" FROM "bottles" WHERE "id" = pg_temp.id('b6')),
  'b6: the reference stays a reference');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "bottles"
              WHERE "needsReview" OR "parentItemId" IS NOT NULL OR "writtenOffAt" IS NOT NULL),
  'nothing is flagged for review, detached or written off');

-- Tastings, history, collections, inventory counts, wishlist.
SELECT pg_temp.expect(
  (SELECT "productId" = pg_temp.id('b1') AND "itemId" = pg_temp.id('b1') AND "guestName" IS NULL
   FROM "tasting_notes" WHERE "id" = pg_temp.id('d1')),
  'a tasting is on the family of its bottle');
SELECT pg_temp.expect(
  (SELECT "productId" = pg_temp.id('b6') FROM "tasting_notes" WHERE "id" = pg_temp.id('d2')),
  'a tasting of a reference is on its family');
SELECT pg_temp.expect(
  (SELECT "productId" IS NULL AND "itemId" IS NULL FROM "tasting_notes" WHERE "id" = pg_temp.id('d3')),
  'an orphan tasting stays without a family');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "audit_logs" WHERE "productId" IS NOT DISTINCT FROM "bottleId") = 3,
  'history lines follow their bottle to its family, the others stay without one');
SELECT pg_temp.expect(
  (SELECT array_agg("A" || '>' || "B" ORDER BY "A", "B") FROM "_CollectionProducts")
    = (SELECT array_agg("A" || '>' || "B" ORDER BY "A", "B") FROM "_CollectionItems")
  AND (SELECT count(*) FROM "_CollectionProducts") = 3,
  'collections hold the same families as records');
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
  INSERT INTO "product_distinctions" ("productId", "otherProductId") VALUES (pg_temp.id('b2'), pg_temp.id('b1'));
  PERFORM pg_temp.expect(false, 'a distinction pair is stored smallest id first');
EXCEPTION WHEN check_violation THEN
  PERFORM pg_temp.expect(true, 'a distinction pair is stored smallest id first');
END $$;
DO $$
DECLARE
  gone BOOLEAN;
BEGIN
  BEGIN
    INSERT INTO "product_distinctions" ("productId", "otherProductId") VALUES (pg_temp.id('b1'), pg_temp.id('b2'));
    DELETE FROM "bottles" WHERE "id" = pg_temp.id('b2');
    DELETE FROM "products" WHERE "id" = pg_temp.id('b2');
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
    RAISE EXCEPTION E'families_expand bench failed:\n  %', failed;
  END IF;
END $$;

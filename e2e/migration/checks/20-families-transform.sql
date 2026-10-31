-- #471 migration bench: what the families_transform migration (FEAT-94) must
-- have made of fixtures/before-families.sql, one block per acceptance
-- criterion, then the edge cases of D2-D5, D26 and QP6. Every failed
-- expectation is listed, then the script fails.

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

-- The family of a fixture record (its unit may have been absorbed: then the
-- family is read from what absorbed it, given explicitly by the checks).
CREATE FUNCTION pg_temp.fam(n TEXT) RETURNS TEXT AS $$
  SELECT "productId" FROM "bottles" WHERE "id" = pg_temp.id(n)
$$ LANGUAGE sql;

-- Units of a family as itemUnits counts them (in stock only).
CREATE FUNCTION pg_temp.units(family TEXT) RETURNS BIGINT AS $$
  SELECT coalesce(sum(CASE
    WHEN "deletedAt" IS NOT NULL OR "writtenOffAt" IS NOT NULL OR ("isOpened" AND "fillLevel" = 0) THEN 0
    WHEN "isOpened" OR ("fillLevel" IS NOT NULL AND "fillLevel" <> 100) OR "cigarsLeft" IS NOT NULL THEN
      CASE WHEN "category" = 'cigar' THEN "cigarsLeft" ELSE 1 END
    WHEN "category" = 'cigar' THEN "quantity" * coalesce("cigarsPerBox", 1)
    ELSE "quantity" END), 0)
  FROM "bottles" WHERE "productId" = family
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Criterion 1: six full records of one wine (same cellar, price, day, no
-- slot) become one card with one group x6; bottles, value and spending are
-- the same before and after (the migration itself refuses to commit
-- otherwise, per category); the old "Increment" counts now count.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT count(*) FROM "bottles" WHERE "productId" = pg_temp.id('101')) = 1
  AND (SELECT "quantity" = 6 AND "purchasePrice" = 300.00 AND "cellarId" = pg_temp.id('c1')
         AND "purchasedAt" = '2026-05-10' AND NOT "needsReview"
       FROM "bottles" WHERE "id" = pg_temp.id('101')),
  'c1: six identical Margaux records are one family with one group x6, the oldest record survives');
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" IN (pg_temp.id('102'), pg_temp.id('103'), pg_temp.id('104'),
                                                       pg_temp.id('105'), pg_temp.id('106')))
  AND NOT EXISTS (SELECT 1 FROM "products" WHERE "id" IN (pg_temp.id('102'), pg_temp.id('103'),
                                                          pg_temp.id('104'), pg_temp.id('105'), pg_temp.id('106'))),
  'c1: the five absorbed records and their families are gone');
SELECT pg_temp.expect(
  (SELECT sum(coalesce("estimatedValue", "purchasePrice", 0) * "quantity") = 1800
     AND sum("purchasePrice" * "quantity") = 1800
   FROM "bottles" WHERE "productId" = pg_temp.id('101')),
  'c1: the Margaux family is worth 1800 and cost 1800, as six bottles at 300 did');
SELECT pg_temp.expect(
  (SELECT "bottleSize" = '75cl' AND "purchasePlace" = 'Wine shop' FROM "bottles" WHERE "id" = pg_temp.id('101')),
  'c1: bottle sizes and places differing by case or spaces (or empty) do not keep groups apart');
SELECT pg_temp.expect(
  (SELECT "quantity" = 4 FROM "bottles" WHERE "id" = pg_temp.id('703')) AND pg_temp.units(pg_temp.id('703')) = 4,
  'c1: a record counting 4 from the old "Increment" button is a group x4 and counts 4');
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('701'))
  AND (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('702'))
  AND (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('b1')),
  'c1: a count of 0, below 0 or empty is one bottle');
SELECT pg_temp.expect(
  (SELECT sum(pg_temp.units(id)) FROM "products" p WHERE "category" = 'wine') = 49,
  'c1: 49 wine bottles in stock, as counted before by rule 3');

-- Family fields of the merged Margaux records (D3).
SELECT pg_temp.expect(
  (SELECT "name" = 'Margaux' AND "producer" = 'Château Margaux' AND "region" = 'Margaux' AND "color" = 'red'
   FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: the family takes, field by field, the first non-empty value; name and producer of the oldest record');
SELECT pg_temp.expect(
  (SELECT "photoUrl" = '/uploads/products/margaux-new.jpg' AND "otherPhotoUrls" = '{/uploads/products/margaux-old.jpg}'
   FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: the most recent photo is kept, the other one stays referenced');
SELECT pg_temp.expect(
  (SELECT "notes" = E'2026-05-10\nBought at the fair\n\n2026-05-10\nFor Paul''s wedding'
   FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: notes are put end to end, each dated, identical ones once');
SELECT pg_temp.expect(
  (SELECT "tags" = '{fair,gift}' AND "lockedFields" = '{region,color}' FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: tags and locks are united');
SELECT pg_temp.expect(
  (SELECT NOT "alertsPaused" AND "consumptionPostponedUntil" IS NULL AND "reminderDate" = '2027-01-01'
     AND "curveShape" = 'PLATEAU' AND "alertStatus" = 'peak'
   FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: alerts paused only if all were, no postponement if one had none, nearest reminder, most recent curve, status recomputed');
SELECT pg_temp.expect(
  (SELECT "fieldSources" = '{"color": "ocr", "region": "ocr"}' FROM "products" WHERE "id" = pg_temp.id('101')),
  'c1/D3: each field keeps the source of the record whose value was kept');
SELECT pg_temp.expect(
  (SELECT "consumptionPostponedUntil" IS NULL FROM "bottles" WHERE "id" = pg_temp.id('101'))
  AND (SELECT "photoUrl" = '/uploads/products/margaux-new.jpg' FROM "bottles" WHERE "id" = pg_temp.id('101')),
  'c1: the unit mirrors the merged family');

-- Everything attached to the absorbed records followed them.
SELECT pg_temp.expect(
  (SELECT "itemId" = pg_temp.id('101') AND "productId" = pg_temp.id('101') FROM "tasting_notes" WHERE "id" = pg_temp.id('d6')),
  'c1: the tasting of an absorbed record is on the surviving group and its family');
SELECT pg_temp.expect(
  (SELECT "bottleId" = pg_temp.id('101') AND "productId" = pg_temp.id('101') FROM "audit_logs"
   WHERE "details" -> 'changes' -> 0 ->> 'to' = '/uploads/products/margaux-new.jpg'),
  'c1: the history of an absorbed record is on the surviving group and its family');
SELECT pg_temp.expect(
  (SELECT "itemId" = pg_temp.id('101') FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f6')),
  'c1: the inventory entry of an absorbed record is on the surviving group');
SELECT pg_temp.expect(
  (SELECT "acquiredItemId" = pg_temp.id('101') FROM "wishlist_items" WHERE "id" = pg_temp.id('ac')),
  'c1: the wishlist link of an absorbed record is on the surviving group');
SELECT pg_temp.expect(
  EXISTS (SELECT 1 FROM "_CollectionProducts" WHERE "A" = pg_temp.id('e1') AND "B" = pg_temp.id('101'))
  AND EXISTS (SELECT 1 FROM "_CollectionItems" WHERE "A" = pg_temp.id('e1') AND "B" = pg_temp.id('101')),
  'c1: the collection of an absorbed record holds the family (and the surviving group)');

-- ---------------------------------------------------------------------------
-- Criterion 2 and D2: an empty value is no disagreement; different values
-- keep families apart, and those are what "À regrouper ?" lists.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  pg_temp.fam('202') = pg_temp.id('201')
  AND (SELECT "region" = 'Haut-Médoc' FROM "products" WHERE "id" = pg_temp.id('201'))
  AND (SELECT count(*) FROM "bottles" WHERE "productId" = pg_temp.id('201')) = 2,
  'c2: "Haut-Médoc" and an empty region are one family (two groups: bought on two days)');
SELECT pg_temp.expect(
  pg_temp.fam('203') = pg_temp.id('203') AND pg_temp.fam('204') = pg_temp.id('204')
  AND (SELECT count(*) FROM "products" WHERE "name" = 'Gruaud Larose') = 2,
  'c2: "Bordeaux" and "Saint-Julien" stay two families of the same key ("À regrouper ?")');
SELECT pg_temp.expect(
  pg_temp.fam('210') = pg_temp.id('203') AND (SELECT "deletedAt" IS NOT NULL FROM "bottles" WHERE "id" = pg_temp.id('210')),
  'D2: a record in the trash, though created first, comes last and joins the first compatible family, still in the trash');
SELECT pg_temp.expect(
  pg_temp.fam('206') = pg_temp.id('205') AND pg_temp.fam('207') = pg_temp.id('207')
  AND (SELECT "region" = 'Bourgogne' FROM "products" WHERE "id" = pg_temp.id('205')),
  'D2: Bourgogne, empty, Rhône gives {Bourgogne, empty} and {Rhône}');
SELECT pg_temp.expect(
  pg_temp.fam('209') = pg_temp.id('208') AND pg_temp.fam('20a') = pg_temp.id('20a')
  AND (SELECT "region" = 'Rhône' FROM "products" WHERE "id" = pg_temp.id('208')),
  'D2: empty, Rhône, Bourgogne gives {empty, Rhône} and {Bourgogne}: compared with the accumulated description');
SELECT pg_temp.expect(
  pg_temp.fam('20b') = pg_temp.id('b1') AND pg_temp.fam('b2') = pg_temp.id('b1'),
  'D2: case, edge spaces and grape order are no disagreement (20b and b2 join b1)');
SELECT pg_temp.expect(
  pg_temp.fam('20d') = pg_temp.id('20d'),
  'D2: other grapes are a disagreement');
SELECT pg_temp.expect(
  pg_temp.fam('214') = pg_temp.id('214') AND pg_temp.fam('213') = pg_temp.id('213'),
  'D2: another drinking window is a disagreement');
SELECT pg_temp.expect(
  pg_temp.fam('20e') = pg_temp.id('b3') AND pg_temp.fam('20f') = pg_temp.id('20f'),
  'D26: no vintage is a vintage of its own: 2008 is another family, not one to regroup');
SELECT pg_temp.expect(
  (SELECT count(*) FROM (
     SELECT 1 FROM "products"
     GROUP BY "category", lower(btrim("producer")), lower(btrim("name")),
       CASE WHEN "category" = 'cigar' THEN coalesce(lower(btrim("format")), '') ELSE coalesce("vintage"::TEXT, '') END
     HAVING count(*) > 1) s) = 6,
  'c2: six keys have families to regroup (Talbot, Gruaud Larose, Clos de Vougeot, Hermitage, Cos d''Estournel, Chambertin)');

-- ---------------------------------------------------------------------------
-- Criterion 3 and D4: a finished record that counted 6 is that finished
-- bottle plus a full group x5 in stock, flagged for review.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT b."quantity" = 1 AND b."isOpened" AND b."fillLevel" = 0 AND NOT b."needsReview"
     AND g."quantity" = 5 AND NOT g."isOpened" AND g."fillLevel" IS NULL AND g."needsReview"
     AND g."productId" = b."productId" AND g."cellarId" = b."cellarId" AND g."purchasePrice" = b."purchasePrice"
     AND g."purchasedAt" = b."purchasedAt" AND g."slotColumn" IS NULL AND g."deletedAt" IS NULL
   FROM "bottles" b JOIN "bottles" g ON g."id" = b."parentItemId" WHERE b."id" = pg_temp.id('b2')),
  'c3: finished x6 is the finished bottle (same id) and a group x5 in stock to review, its group of origin');
SELECT pg_temp.expect(
  (SELECT b."quantity" = 1 AND b."isOpened" AND b."fillLevel" = 50 AND b."slotColumn" = 2 AND b."slotRow" = 1
     AND g."quantity" = 2 AND g."needsReview" AND g."slotColumn" IS NULL
     AND g."estimatedValue" = 95.00 AND g."purchasePlace" = 'Distillery'
   FROM "bottles" b JOIN "bottles" g ON g."id" = b."parentItemId" WHERE b."id" = pg_temp.id('301'))
  AND (SELECT "itemId" = pg_temp.id('301') FROM "tasting_notes" WHERE "id" = pg_temp.id('d5')),
  'c3/D4: opened x3 keeps its state, slot and tasting as x1; the group x2 has the same value and place, no slot');
SELECT pg_temp.expect(
  (SELECT g."quantity" = 1 AND g."needsReview" AND g."deletedAt" = b."deletedAt"
   FROM "bottles" b JOIN "bottles" g ON g."id" = b."parentItemId" WHERE b."id" = pg_temp.id('302')),
  'c3: a split record in the trash leaves its group in the trash too');
SELECT pg_temp.expect(
  (SELECT g."quantity" = 3 FROM "bottles" b JOIN "bottles" g ON g."id" = b."parentItemId" WHERE b."id" = pg_temp.id('303'))
  AND (SELECT "quantity" = 1 AND "parentItemId" IS NULL AND NOT "needsReview" FROM "bottles" WHERE "id" = pg_temp.id('304')),
  'c3: opened with no level x4 splits into 1 + 3; a single record with a state of its own is left alone');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "bottles" WHERE "needsReview") = 4
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "needsReview" AND ("isOpened" OR "parentItemId" IS NOT NULL)),
  'c3: only the four guessed groups are to review');

-- ---------------------------------------------------------------------------
-- Criterion 4: tastings, slots and history are on the right family; a
-- non-owned reference is a wine known without a bottle.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" IN (pg_temp.id('b6'), pg_temp.id('401'), pg_temp.id('402')))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE NOT "isOwned"),
  'c4: no reference is left as a unit');
SELECT pg_temp.expect(
  (SELECT "name" = 'Clos Rougeard' AND "deletedAt" IS NULL FROM "products" WHERE "id" = pg_temp.id('b6'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "productId" = pg_temp.id('b6'))
  AND (SELECT "productId" = pg_temp.id('b6') AND "itemId" IS NULL FROM "tasting_notes" WHERE "id" = pg_temp.id('d2')),
  'c4: a reference is a family without a bottle, with its tasting');
SELECT pg_temp.expect(
  (SELECT "productId" = pg_temp.id('101') AND "itemId" IS NULL FROM "tasting_notes" WHERE "id" = pg_temp.id('d4'))
  AND (SELECT "productId" = pg_temp.id('101') AND "bottleId" IS NULL FROM "audit_logs"
       WHERE "action" = 'CREATE' AND "userId" = pg_temp.id('a2')),
  'c4: a reference of a wine in the cellar joins its family with its tasting and history');
SELECT pg_temp.expect(
  (SELECT "acquiredItemId" IS NULL FROM "wishlist_items" WHERE "id" = pg_temp.id('ad'))
  AND NOT EXISTS (SELECT 1 FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f7')),
  'c4: the wishlist link and inventory entry of a reference have no unit left to point at');
SELECT pg_temp.expect(
  (SELECT "deletedAt" = '2026-09-20 10:00:00' FROM "products" WHERE "id" = pg_temp.id('402')),
  'c4: a reference in the trash is a family in the trash, restorable');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "tasting_notes") = 7 AND (SELECT count(*) FROM "audit_logs") = 5,
  'c4: no tasting and no history line is lost');
SELECT pg_temp.expect(
  (SELECT array_agg(right("id", 3) || ':' || "slotColumn" || ',' || "slotRow" ORDER BY "slotColumn")
   FROM "bottles" WHERE "deletedAt" IS NULL AND "slotColumn" IS NOT NULL)
  = '{"0b1:1,1","301:2,1","604:4,1","605:5,1"}',
  'c4: every occupied slot is held by the same record, except the emptied cigar box');

-- ---------------------------------------------------------------------------
-- Cigars (rule 3, FEAT-95): a box of the cigars left.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 AND "cigarsPerBox" = 25 AND "cigarsLeft" = 25 AND "isOpened" FROM "bottles" WHERE "id" = pg_temp.id('b5')),
  'cigars: an opened box of 25 left is a box of 25 opened with 25 left');
SELECT pg_temp.expect(
  (SELECT "quantity" = 2 AND "cigarsPerBox" = 25 AND "cigarsLeft" IS NULL AND NOT "isOpened" AND "purchasePrice" = 450.00
   FROM "bottles" WHERE "id" = pg_temp.id('501'))
  AND pg_temp.fam('501') = pg_temp.id('b5') AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" = pg_temp.id('502')),
  'cigars: two closed boxes of 25 of the same cigar are a group of 2 boxes, at the price of a box');
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 AND "isOpened" AND "fillLevel" = 0 AND "slotColumn" IS NULL FROM "bottles" WHERE "id" = pg_temp.id('503')),
  'cigars: a box with no cigar left is a finished box and frees its slot');
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 AND "cigarsPerBox" = 1 AND NOT "isOpened" FROM "bottles" WHERE "id" = pg_temp.id('504')),
  'cigars: a box without a count is a box of one cigar');
SELECT pg_temp.expect(
  pg_temp.fam('505') = pg_temp.id('505') AND pg_temp.fam('507') = pg_temp.id('506') AND pg_temp.fam('508') = pg_temp.id('508'),
  'cigars: the vitola is in the key, an empty one is a value of its own (D26)');
SELECT pg_temp.expect(
  (SELECT "cigarsPerBox" = 10 AND "cigarsLeft" = 0 AND "isOpened" AND "fillLevel" = 0 FROM "bottles" WHERE "id" = pg_temp.id('509')),
  'cigars: a finished box keeps its size, with no cigar left');
SELECT pg_temp.expect(
  pg_temp.units(pg_temp.id('b5')) = 75 AND pg_temp.units(pg_temp.id('506')) = 13
  AND (SELECT sum(pg_temp.units(id)) FROM "products" WHERE "category" = 'cigar') = 109,
  'cigars: 109 cigars in stock, as many as before');

-- ---------------------------------------------------------------------------
-- Rule 4 exceptions and the D5 guard.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT "quantity" = 4 AND "purchasePlace" = 'Fair' AND "location" = 'Rack A' FROM "bottles" WHERE "id" = pg_temp.id('601'))
  AND (SELECT "quantity" = 3 AND "purchasePlace" = 'Shop' AND "location" = 'rack b' FROM "bottles" WHERE "id" = pg_temp.id('602'))
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "id" IN (pg_temp.id('603'), pg_temp.id('606'), pg_temp.id('607'),
                                                       pg_temp.id('60a'), pg_temp.id('60b'))),
  'D5: two groups counted in one inventory session stay apart; a place or a location joins an empty one, never another');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "inventory_count_entries" WHERE "sessionId" = pg_temp.id('f1')) = 3
  AND (SELECT "itemId" = pg_temp.id('601') FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f4'))
  AND (SELECT "itemId" = pg_temp.id('602') FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f5')),
  'D5: the inventory session keeps one entry per group');
SELECT pg_temp.expect(
  (SELECT "foundQuantity" = 1 FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f4'))
  AND (SELECT "foundQuantity" = 1 FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f5'))
  AND (SELECT "foundQuantity" = 1 FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f6'))
  AND (SELECT "foundQuantity" IS NULL FROM "inventory_count_entries" WHERE "id" = pg_temp.id('f2')),
  'D15: an entry that counted one record of a fused group found 1 of it (the others stay missing); an entry on an unfused unit is unchanged');
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('604'))
  AND (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('605')),
  'rule 4: groups holding a slot stay apart until FEAT-93');
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('608'))
  AND (SELECT "quantity" = 1 FROM "bottles" WHERE "id" = pg_temp.id('609'))
  AND (SELECT count(*) FROM "bottles" WHERE "productId" = pg_temp.id('601')) = 6,
  'D5: another estimated value or another price is another group of the same family');
SELECT pg_temp.expect(
  EXISTS (SELECT 1 FROM "_CollectionProducts" WHERE "A" = pg_temp.id('e2') AND "B" = pg_temp.id('601'))
  AND (SELECT count(*) FROM "_CollectionItems" WHERE "A" = pg_temp.id('e2') AND "B" IN (
         SELECT "id" FROM "bottles" WHERE "productId" = pg_temp.id('601'))) = 6,
  'rule 4: a collection holding an absorbed record holds the family, and the mirror every group of it');

-- Guards of the fusion and of the walk.
SELECT pg_temp.expect(
  (SELECT "quantity" = 1 AND NOT "needsReview" AND "purchasedAt" = '2026-07-02' FROM "bottles" WHERE "id" = pg_temp.id('20c'))
  AND (SELECT g."quantity" = 5 FROM "bottles" b JOIN "bottles" g ON g."id" = b."parentItemId" WHERE b."id" = pg_temp.id('b2')),
  'rule 4: a guessed group is never fused, even with an identical group');
SELECT pg_temp.expect(
  (SELECT count(*) FROM "bottles" WHERE "id" IN (pg_temp.id('210'), pg_temp.id('211')) AND "quantity" = 1) = 2,
  'rule 4: identical groups in the trash are not fused');
SELECT pg_temp.expect(
  pg_temp.fam('404') = pg_temp.id('404') AND pg_temp.fam('405') = pg_temp.id('404')
  AND NOT EXISTS (SELECT 1 FROM "bottles" WHERE "productId" = pg_temp.id('403'))
  AND (SELECT "deletedAt" IS NULL FROM "products" WHERE "id" = pg_temp.id('403'))
  AND (SELECT "productId" = pg_temp.id('403') FROM "tasting_notes" WHERE "id" = pg_temp.id('d7')),
  'D2: a record in the trash does not join a family known only without a bottle; it may join one only in the trash');
SELECT pg_temp.expect(
  (SELECT "consumptionPostponedUntil" = '2027-02-01' FROM "products" WHERE "id" = pg_temp.id('201')),
  'D3: when every record was postponed, the family is postponed until the nearest date');
SELECT pg_temp.expect(
  (SELECT "collection" = 'Cave de Paul / Mariage' FROM "products" WHERE "id" = pg_temp.id('101'))
  AND (SELECT "collection" = 'Cave de Paul / Mariage' FROM "bottles" WHERE "id" = pg_temp.id('101')),
  'legacy label: the distinct labels of the records are joined, in order, once each');
SELECT pg_temp.expect(
  (SELECT "collection" = repeat('A', 150)
     AND "notes" LIKE '%Libellés d''origine : ' || repeat('A', 150) || ' / ' || repeat('B', 80)
   FROM "products" WHERE "id" = pg_temp.id('201')),
  'legacy label: labels beyond 200 characters are kept in the notes, none is lost');
SELECT pg_temp.expect(
  (SELECT cardinality("tags") = 24 FROM "products" WHERE "id" = pg_temp.id('201')),
  'D3: tags are united even beyond the form''s 20 (counted for the release notes, not cut)');

-- ---------------------------------------------------------------------------
-- QP6: presets that wrote a state are deleted, the others kept.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
  (SELECT array_agg("name" ORDER BY "name") FROM "bulk_presets") = '{"Tag it","To the garage"}',
  'QP6: presets writing opened, a level or an opening date are deleted, the others kept');

DO $$
DECLARE
  failed TEXT;
BEGIN
  SELECT string_agg(what, E'\n  ') INTO failed FROM failures;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'families_transform bench failed:\n  %', failed;
  END IF;
END $$;

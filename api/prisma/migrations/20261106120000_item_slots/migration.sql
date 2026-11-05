-- FEAT-93 (#847, stage 3 of #471): several cellar-plan slots per unit, in one
-- migration: expansion, transformation, contraction (design.md "Sauvegarde &
-- Migration"; plan of stage 3, §3).
--
--   expansion: the `item_slots` table (one row per occupied cell), keyed to
--   its unit AND its unit's cellar, so a slot can never sit in another
--   cellar than its bottle's; one live slot per cell (partial unique index:
--   a slot in the trash keeps its cell without reserving it, #174);
--   1. the slots: every unit in stock or in the trash that held a cell
--      (`bottles.slotColumn/slotRow`) holds the same cell as a slot, in the
--      trash with it when it is; coordinates without a cellar (#579), half
--      filled, out of the grid's range or on a unit finished or written off
--      are counted and left behind;
--   2. fusion (design.md rule 4, the families migration's rules): identical
--      full groups left apart at stage 1 because each held a slot are fused,
--      the survivor keeping every slot; a group of single cigars, which
--      takes one cell for all its cigars, never gathers two slots;
--   then the contraction: `slotColumn`, `slotRow` and their unique index
--   leave `bottles`; and a deferred guard keeps, at every commit, a unit's
--   live slots within its capacity (none once out of stock or in the trash).
--
-- Every figure the members rely on (units, value and spending per category,
-- tastings, history, inventory counts, wishlist links, and every occupied
-- cell) is recorded before and checked after: any difference raises an
-- exception and rolls the whole migration back. Counts for the release notes
-- are logged with RAISE NOTICE.
--
-- Forward only: going back means restoring the backup taken before the
-- update (glou-backup-before-migration-*.sql.gz) with the previous image.
-- Applied entirely or not at all, in one transaction, WITHOUT an explicit
-- BEGIN / COMMIT (see the families migration: `prisma migrate deploy` sends
-- the file as one simple query, which PostgreSQL runs as one transaction; a
-- failed check then reaches the administrator with its reason, and P3009 on
-- restart). Nothing that leaves or breaks that transaction.

-- ===========================================================================
-- Expansion
-- ===========================================================================

-- CreateTable
CREATE TABLE "item_slots" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cellarId" TEXT NOT NULL,
    "column" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_slots_itemId_idx" ON "item_slots"("itemId");

-- CreateIndex
CREATE INDEX "item_slots_cellarId_column_row_idx" ON "item_slots"("cellarId", "column", "row");

-- CreateIndex
CREATE UNIQUE INDEX "bottles_id_cellarId_key" ON "bottles"("id", "cellarId");

-- AddForeignKey: NO ACTION on update, checked at the end of the statement.
-- Changing a unit's cellar while it holds slots is refused (the API frees
-- them first); deleting a cellar cascades on its slots and sets its units'
-- cellar to NULL in the same statement, which then passes the check.
ALTER TABLE "item_slots" ADD CONSTRAINT "item_slots_itemId_cellarId_fkey" FOREIGN KEY ("itemId", "cellarId") REFERENCES "bottles"("id", "cellarId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_slots" ADD CONSTRAINT "item_slots_cellarId_fkey" FOREIGN KEY ("cellarId") REFERENCES "cellars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Not expressible in Prisma's schema (noted on the model): the grid's range
-- (the API's own bounds) and one live slot per cell.
ALTER TABLE "item_slots" ADD CONSTRAINT "item_slots_cell_range"
  CHECK ("column" BETWEEN 1 AND 100 AND "row" BETWEEN 1 AND 100);
CREATE UNIQUE INDEX "item_slots_cell_unique" ON "item_slots" ("cellarId", "column", "row") WHERE "deletedAt" IS NULL;

-- ===========================================================================
-- Transformation
-- ===========================================================================

-- >>> families rules
-- The rules shared with TypeScript (shared/units.ts is the reference, line for
-- line). The migration bench runs this block on its own against the case
-- table the TypeScript tests read (e2e/migration/fixtures/units-cases.json),
-- so keep it self-contained.

-- Text as TypeScript's `trim().toLowerCase()` compares it; empty = NULL.
-- Only ASCII white space is trimmed (a subset of what `trim()` removes: not
-- the no-break space) and `lower()` depends on the server locale: when the
-- two differ, SQL sees two keys where TypeScript sees one, never the
-- reverse, so families can only be left apart ("À regrouper ?", computed in
-- TypeScript, proposes them).
CREATE FUNCTION pg_temp.fam_norm(v TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(lower(btrim(v, E' \t\n\r\f\v')), '')
$$;

-- A list compared as a set of normalised values; empty = NULL.
CREATE FUNCTION pg_temp.fam_norm_set(v TEXT[]) RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(DISTINCT n ORDER BY n)
  FROM (SELECT pg_temp.fam_norm(x) COLLATE "C" AS n FROM unnest(v) AS x) s
  WHERE n IS NOT NULL
$$;

-- productKey ("Famille identique"): category, producer, name and vintage; the
-- vitola (`format`) instead of the vintage for a cigar. An empty vintage or
-- vitola is a value of its own (D26).
CREATE FUNCTION pg_temp.fam_product_key(category TEXT, producer TEXT, name TEXT, vintage INT, format TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(
    category,
    coalesce(pg_temp.fam_norm(producer), ''),
    coalesce(pg_temp.fam_norm(name), ''),
    CASE WHEN category = 'cigar' THEN coalesce(pg_temp.fam_norm(format), '') ELSE coalesce(vintage::TEXT, '') END
  )::TEXT
$$;

-- groupKey (D5): family, cellar, purchase price, purchase day and size (the
-- normalised bottle size, or the box size for a cigar, empty = single
-- cigars). Empty equals empty; an empty price differs from 0.
CREATE FUNCTION pg_temp.fam_group_key(product_id TEXT, cellar_id TEXT, purchase_price NUMERIC, purchased_at DATE,
  bottle_size TEXT, cigars_per_box INT, is_cigar BOOLEAN)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(product_id, cellar_id, purchase_price, purchased_at,
    CASE WHEN is_cigar THEN to_jsonb(cigars_per_box) ELSE to_jsonb(coalesce(pg_temp.fam_norm(bottle_size), '')) END
  )::TEXT
$$;

-- isIntactItem: a closed, full bottle or a closed, complete box of cigars.
CREATE FUNCTION pg_temp.fam_is_intact(is_opened BOOLEAN, fill_level INT, cigars_left INT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT is_opened AND (fill_level IS NULL OR fill_level = 100) AND cigars_left IS NULL
$$;

-- Copies held (bottles, boxes or single cigars): a group's count (1 when
-- empty), 1 for an opened sub-record, 0 once finished or written off.
CREATE FUNCTION pg_temp.fam_copies(quantity INT, is_opened BOOLEAN, fill_level INT, written_off_at TIMESTAMP)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN written_off_at IS NOT NULL OR (is_opened AND fill_level IS NOT DISTINCT FROM 0) THEN 0
    WHEN is_opened THEN 1
    ELSE greatest(coalesce(quantity, 1), 0)
  END
$$;

-- itemUnits: bottles, or cigars (a group of boxes counts its cigars, an
-- opened box the cigars left, single cigars their count).
CREATE FUNCTION pg_temp.fam_units(quantity INT, cigars_per_box INT, cigars_left INT, is_opened BOOLEAN, fill_level INT, written_off_at TIMESTAMP)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN pg_temp.fam_copies(quantity, is_opened, fill_level, written_off_at) = 0 THEN 0
    WHEN is_opened THEN coalesce(cigars_left, 1)
    WHEN cigars_per_box IS NOT NULL THEN pg_temp.fam_copies(quantity, is_opened, fill_level, written_off_at) * cigars_per_box
    ELSE pg_temp.fam_copies(quantity, is_opened, fill_level, written_off_at)
  END
$$;

-- itemValue (#594): value of one copy (estimated, else purchase price, else
-- 0) times the copies held.
CREATE FUNCTION pg_temp.fam_value(estimated_value NUMERIC, purchase_price NUMERIC, quantity INT, is_opened BOOLEAN, fill_level INT, written_off_at TIMESTAMP)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(estimated_value, purchase_price, 0) * pg_temp.fam_copies(quantity, is_opened, fill_level, written_off_at)
$$;

-- itemSpend: purchase price of one copy times the copies bought, finished
-- and written-off ones included.
CREATE FUNCTION pg_temp.fam_spend(purchase_price NUMERIC, quantity INT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(purchase_price, 0) * greatest(coalesce(quantity, 1), 0)
$$;
-- <<< families rules

-- Any failure below names the step and rolls everything back.
CREATE FUNCTION pg_temp.slot_fail_if(failed BOOLEAN, message TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF failed THEN
    RAISE EXCEPTION 'slots: %. The migration was rolled back: no data was changed.', message;
  END IF;
END $$;

-- Temporary tables live until the end of the migration's transaction.
CREATE TEMP TABLE slot_counts (what TEXT PRIMARY KEY, n BIGINT NOT NULL) ON COMMIT DROP;

-- The guard's rule (kept after the migration, see step 5): what is wrong
-- with the live slots of a unit, NULL when nothing is. A unit holds at most
-- `slotCapacity` live slots (shared/units.ts): its copies in stock (bottles,
-- boxes), 1 for an opened sub-record and for a group of single cigars (one
-- cell for the group), none once finished, written off or in the trash.
CREATE FUNCTION "item_slots_violation"(unit_id TEXT) RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  u RECORD;
  live INT;
  capacity INT;
BEGIN
  SELECT count(*) INTO live FROM "item_slots" WHERE "itemId" = unit_id AND "deletedAt" IS NULL;
  IF live = 0 THEN
    RETURN NULL;
  END IF;
  SELECT b."quantity", b."isOpened", b."fillLevel", b."writtenOffAt", b."cigarsPerBox", b."deletedAt", p."category"
    INTO u FROM "bottles" b JOIN "products" p ON p."id" = b."productId" WHERE b."id" = unit_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  capacity := CASE
    WHEN u."deletedAt" IS NOT NULL OR u."writtenOffAt" IS NOT NULL
      OR (u."isOpened" AND u."fillLevel" IS NOT DISTINCT FROM 0) THEN 0
    WHEN u."isOpened" THEN 1
    WHEN u."category" = 'cigar' AND u."cigarsPerBox" IS NULL THEN 1
    ELSE greatest(coalesce(u."quantity", 1), 0)
  END;
  IF live > capacity THEN
    RETURN format('unit %s holds %s live slot(s) for a capacity of %s', unit_id, live, capacity);
  END IF;
  RETURN NULL;
END $$;

-- Deleting units checks every table pointing at them; two of these columns
-- have no index (dropped at the end).
CREATE INDEX "slot_tmp_audit_logs_bottleId" ON "audit_logs" ("bottleId");
CREATE INDEX "slot_tmp_inventory_count_entries_itemId" ON "inventory_count_entries" ("itemId");

-- ---------------------------------------------------------------------------
-- 0. Before: what the members have, and where every link points.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE slot_totals ON COMMIT DROP AS
SELECT p."category"::TEXT AS category,
  sum(pg_temp.fam_units(b."quantity", b."cigarsPerBox", b."cigarsLeft", b."isOpened", b."fillLevel", b."writtenOffAt")) AS units,
  sum(pg_temp.fam_value(b."estimatedValue", b."purchasePrice", b."quantity", b."isOpened", b."fillLevel", b."writtenOffAt")) AS value,
  sum(pg_temp.fam_spend(b."purchasePrice", b."quantity")) AS spend
FROM "bottles" b JOIN "products" p ON p."id" = b."productId"
WHERE b."deletedAt" IS NULL GROUP BY p."category";

CREATE TEMP TABLE slot_units ON COMMIT DROP AS SELECT "id", "parentItemId" FROM "bottles";
CREATE TEMP TABLE slot_tastings ON COMMIT DROP AS SELECT "id", "itemId" FROM "tasting_notes";
CREATE TEMP TABLE slot_logs ON COMMIT DROP AS SELECT "id", "bottleId" FROM "audit_logs";
CREATE TEMP TABLE slot_entries ON COMMIT DROP AS
  SELECT "id", "itemId" FROM "inventory_count_entries" WHERE "itemId" IS NOT NULL;
CREATE TEMP TABLE slot_wishes ON COMMIT DROP AS
  SELECT "id", "acquiredItemId" FROM "wishlist_items" WHERE "acquiredItemId" IS NOT NULL;

-- Every unit with a coordinate, and why it keeps its cell or not.
CREATE TEMP TABLE slot_coords ON COMMIT DROP AS
SELECT b."id", b."cellarId", b."slotColumn" AS col, b."slotRow" AS row_, b."deletedAt",
  CASE
    WHEN b."cellarId" IS NULL THEN 'coordinates without a cellar, left behind'
    WHEN b."slotColumn" IS NULL OR b."slotRow" IS NULL THEN 'half-filled coordinates, left behind'
    WHEN b."slotColumn" NOT BETWEEN 1 AND 100 OR b."slotRow" NOT BETWEEN 1 AND 100 THEN 'coordinates out of the grid range, left behind'
    WHEN pg_temp.fam_copies(b."quantity", b."isOpened", b."fillLevel", b."writtenOffAt") = 0
      THEN 'coordinates on a finished or written-off unit, left behind'
  END AS left_behind
FROM "bottles" b
WHERE b."slotColumn" IS NOT NULL OR b."slotRow" IS NOT NULL;

-- The cells kept: in stock or in the trash (with the unit's own deletion time).
CREATE TEMP TABLE slot_before ON COMMIT DROP AS
SELECT "id", "cellarId", col, row_, "deletedAt" FROM slot_coords WHERE left_behind IS NULL;

-- ---------------------------------------------------------------------------
-- 1. Slots: each cell kept becomes a slot of its unit.
-- ---------------------------------------------------------------------------
INSERT INTO "item_slots" ("id", "itemId", "cellarId", "column", "row", "deletedAt", "createdAt")
SELECT gen_random_uuid()::TEXT, "id", "cellarId", col, row_, "deletedAt", now() FROM slot_before;

INSERT INTO slot_counts SELECT 'slots copied', count(*) FROM slot_before;
INSERT INTO slot_counts SELECT left_behind, count(*) FROM slot_coords WHERE left_behind IS NOT NULL GROUP BY left_behind;

-- ---------------------------------------------------------------------------
-- 2. Fusion (rule 4, D5), as the families migration's step 6: full groups of
-- a family with the same identity (groupKey: family, cellar, purchase price,
-- purchase day, bottle size or box size) and the same estimated value fuse
-- into the oldest. Place of purchase and location must not disagree (empty
-- agrees), compared with what the group has accumulated. Left apart: groups
-- in the trash or written off, guessed ones (to review on their own),
-- groups without a purchase day, and groups counted in the same inventory
-- session. A slot no longer keeps a group apart: the survivor takes them
-- all, except that a group of single cigars (one cell for the group) never
-- gathers two placed groups.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE slot_fuse_rec ON COMMIT DROP AS
SELECT
  b."id",
  jsonb_build_array(
    pg_temp.fam_group_key(b."productId", b."cellarId", b."purchasePrice", b."purchasedAt", b."bottleSize",
      b."cigarsPerBox", p."category" = 'cigar'),
    b."estimatedValue"
  )::TEXT AS gk,
  b."createdAt",
  pg_temp.fam_norm(b."purchasePlace") AS place,
  pg_temp.fam_norm(b."location") AS location,
  p."category" = 'cigar' AND b."cigarsPerBox" IS NULL AS single,
  EXISTS (SELECT 1 FROM "item_slots" s WHERE s."itemId" = b."id") AS placed
FROM "bottles" b JOIN "products" p ON p."id" = b."productId"
WHERE b."deletedAt" IS NULL AND b."writtenOffAt" IS NULL AND NOT b."needsReview" AND b."purchasedAt" IS NOT NULL
  AND pg_temp.fam_is_intact(b."isOpened", b."fillLevel", b."cigarsLeft");

-- The inventory sessions each candidate is counted in.
CREATE TEMP TABLE slot_fuse_sessions ON COMMIT DROP AS
SELECT e."itemId" AS item_id, e."sessionId" AS session_id
FROM "inventory_count_entries" e JOIN slot_fuse_rec r ON r."id" = e."itemId";
CREATE INDEX ON slot_fuse_sessions (item_id);
CREATE INDEX ON slot_fuse_sessions (session_id);

CREATE TEMP TABLE slot_fuse_grp (grp TEXT PRIMARY KEY, gk TEXT NOT NULL, seq INT NOT NULL, place TEXT, location TEXT,
  placed BOOLEAN NOT NULL) ON COMMIT DROP;
CREATE INDEX ON slot_fuse_grp (gk, seq);
CREATE TEMP TABLE slot_fuse_of (item_id TEXT PRIMARY KEY, grp TEXT NOT NULL, rank INT NOT NULL) ON COMMIT DROP;
CREATE INDEX ON slot_fuse_of (grp);

DO $$
DECLARE
  r RECORD;
  target TEXT;
  n INT := 0;
BEGIN
  FOR r IN SELECT * FROM slot_fuse_rec ORDER BY gk COLLATE "C", "createdAt", "id" COLLATE "C" LOOP
    n := n + 1;
    SELECT g.grp INTO target FROM slot_fuse_grp g
    WHERE g.gk = r.gk
      AND (g.place IS NULL OR r.place IS NULL OR g.place = r.place)
      AND (g.location IS NULL OR r.location IS NULL OR g.location = r.location)
      -- Single cigars take one cell for the whole group: two placed groups
      -- would leave the survivor with two (FEAT-93 criterion 5 keeps both).
      AND NOT (r.single AND r.placed AND g.placed)
      AND NOT EXISTS (
        SELECT 1
        FROM slot_fuse_sessions mine
        JOIN slot_fuse_sessions theirs ON theirs.session_id = mine.session_id
        JOIN slot_fuse_of f ON f.item_id = theirs.item_id
        WHERE mine.item_id = r."id" AND f.grp = g.grp)
    ORDER BY g.seq LIMIT 1;
    IF target IS NULL THEN
      INSERT INTO slot_fuse_grp VALUES (r."id", r.gk, n, r.place, r.location, r.placed);
      target := r."id";
    ELSE
      UPDATE slot_fuse_grp SET place = coalesce(place, r.place), location = coalesce(location, r.location),
        placed = placed OR r.placed
      WHERE grp = target;
    END IF;
    INSERT INTO slot_fuse_of VALUES (r."id", target, n);
  END LOOP;
END $$;

DELETE FROM slot_fuse_of WHERE grp IN (SELECT grp FROM slot_fuse_of GROUP BY grp HAVING count(*) = 1);

-- Inventory counts (D15): an entry counted one group, which becomes part of
-- a larger one; it keeps the number it found, so the others still show as
-- missing in the session instead of the whole group being counted found.
UPDATE "inventory_count_entries" e SET "foundQuantity" = coalesce(e."foundQuantity", m."quantity")
FROM slot_fuse_of f JOIN "bottles" m ON m."id" = f.item_id
WHERE e."itemId" = f.item_id;

-- The surviving group: the sum of the counts, the first non-empty place and
-- location, the locks of all, and per field the oldest group's source.
UPDATE "bottles" b SET
  "quantity" = s.quantity,
  "purchasePlace" = s.place,
  "location" = s.location,
  "lockedFields" = s.locks,
  "fieldSources" = s.sources
FROM (
  SELECT f.grp,
    sum(m."quantity")::INT AS quantity,
    (array_agg(m."purchasePlace" ORDER BY f.rank) FILTER (WHERE pg_temp.fam_norm(m."purchasePlace") IS NOT NULL))[1] AS place,
    (array_agg(m."location" ORDER BY f.rank) FILTER (WHERE pg_temp.fam_norm(m."location") IS NOT NULL))[1] AS location,
    ARRAY(SELECT DISTINCT l FROM slot_fuse_of f2 JOIN "bottles" m2 ON m2."id" = f2.item_id,
          unnest(m2."lockedFields") AS l WHERE f2.grp = f.grp ORDER BY l) AS locks,
    (SELECT jsonb_object_agg(key, value) FROM (
       SELECT DISTINCT ON (fs.key) fs.key, fs.value
       FROM slot_fuse_of f2 JOIN "bottles" m2 ON m2."id" = f2.item_id
       CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(m2."fieldSources") = 'object' THEN m2."fieldSources" ELSE '{}' END) AS fs
       WHERE f2.grp = f.grp ORDER BY fs.key, f2.rank) x) AS sources
  FROM slot_fuse_of f JOIN "bottles" m ON m."id" = f.item_id
  GROUP BY f.grp
) s
WHERE b."id" = s.grp;

-- Everything attached to an absorbed group moves to the survivor, its slots
-- included (same cellar: the cellar is part of the group's identity).
UPDATE "item_slots" s SET "itemId" = f.grp FROM slot_fuse_of f WHERE s."itemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "tasting_notes" t SET "itemId" = f.grp FROM slot_fuse_of f WHERE t."itemId" = f.item_id AND f.item_id <> f.grp;
-- History keeps the line it was recorded on (absorbedFrom, #471).
UPDATE "audit_logs" a SET "bottleId" = f.grp,
  "details" = coalesce(a."details", '{}'::jsonb) || jsonb_build_object('absorbedFrom', a."bottleId")
FROM slot_fuse_of f WHERE a."bottleId" = f.item_id AND f.item_id <> f.grp;
UPDATE "inventory_count_entries" e SET "itemId" = f.grp FROM slot_fuse_of f WHERE e."itemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "wishlist_items" w SET "acquiredItemId" = f.grp FROM slot_fuse_of f WHERE w."acquiredItemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "bottles" b SET "parentItemId" = f.grp FROM slot_fuse_of f WHERE b."parentItemId" = f.item_id AND f.item_id <> f.grp;
DELETE FROM "bottles" b USING slot_fuse_of f WHERE b."id" = f.item_id AND f.item_id <> f.grp;

INSERT INTO slot_counts SELECT 'groups fused into another', count(*) FROM slot_fuse_of WHERE item_id <> grp;

-- ---------------------------------------------------------------------------
-- 3. Contraction: the cell lives in `item_slots` only.
-- ---------------------------------------------------------------------------
DROP INDEX "bottles_cellar_slot_unique";

-- AlterTable
ALTER TABLE "bottles" DROP COLUMN "slotColumn",
DROP COLUMN "slotRow";

-- ---------------------------------------------------------------------------
-- 4. Invariants. Any failure rolls the whole migration back.
-- ---------------------------------------------------------------------------
-- Where each unit went: itself, or the group that absorbed it.
CREATE TEMP TABLE slot_fate ON COMMIT DROP AS
SELECT u."id" AS old_id, coalesce(f.grp, u."id") AS new_id
FROM slot_units u LEFT JOIN slot_fuse_of f ON f.item_id = u."id";
CREATE UNIQUE INDEX ON slot_fate (old_id);
ANALYZE slot_fate;

SELECT pg_temp.slot_fail_if(
  EXISTS (SELECT 1 FROM "bottles" WHERE "quantity" IS NULL OR "quantity" < 1),
  'a unit has no count or a count below 1');

-- Units, value and spending per category.
SELECT pg_temp.slot_fail_if(
  EXISTS (
    SELECT 1
    FROM slot_totals bf
    FULL JOIN (
      SELECT p."category"::TEXT AS category,
        sum(pg_temp.fam_units(b."quantity", b."cigarsPerBox", b."cigarsLeft", b."isOpened", b."fillLevel", b."writtenOffAt")) AS units,
        sum(pg_temp.fam_value(b."estimatedValue", b."purchasePrice", b."quantity", b."isOpened", b."fillLevel", b."writtenOffAt")) AS value,
        sum(pg_temp.fam_spend(b."purchasePrice", b."quantity")) AS spend
      FROM "bottles" b JOIN "products" p ON p."id" = b."productId"
      WHERE b."deletedAt" IS NULL GROUP BY p."category"
    ) af ON af.category = bf.category
    WHERE (coalesce(bf.units, 0), coalesce(bf.value, 0), coalesce(bf.spend, 0))
      IS DISTINCT FROM (coalesce(af.units, 0), coalesce(af.value, 0), coalesce(af.spend, 0))),
  'the units, value or spending of a category differ before and after');

-- Tastings, history, inventory entries, wishlist links and sub-records: none
-- lost, each on what became of its unit.
SELECT pg_temp.slot_fail_if(
  (SELECT count(*) FROM "tasting_notes") <> (SELECT count(*) FROM slot_tastings)
  OR EXISTS (
    SELECT 1 FROM slot_tastings t0
    LEFT JOIN "tasting_notes" t ON t."id" = t0."id"
    LEFT JOIN slot_fate x ON x.old_id = t0."itemId"
    WHERE t."id" IS NULL OR t."itemId" IS DISTINCT FROM x.new_id),
  'a tasting was lost or does not follow its bottle');
SELECT pg_temp.slot_fail_if(
  (SELECT count(*) FROM "audit_logs") <> (SELECT count(*) FROM slot_logs)
  OR EXISTS (
    SELECT 1 FROM slot_logs l0
    LEFT JOIN "audit_logs" l ON l."id" = l0."id"
    LEFT JOIN slot_fate x ON x.old_id = l0."bottleId"
    WHERE l."id" IS NULL OR l."bottleId" IS DISTINCT FROM x.new_id),
  'a history line was lost or does not follow its bottle');
SELECT pg_temp.slot_fail_if(
  EXISTS (
    SELECT 1 FROM slot_entries e0 JOIN slot_fate x ON x.old_id = e0."itemId"
    LEFT JOIN "inventory_count_entries" e ON e."id" = e0."id"
    WHERE e."itemId" IS DISTINCT FROM x.new_id),
  'an inventory count entry was lost or does not follow its unit');
SELECT pg_temp.slot_fail_if(
  EXISTS (
    SELECT 1 FROM "inventory_count_entries" e JOIN slot_fuse_of f ON f.grp = e."itemId" AND f.item_id = f.grp
    JOIN "bottles" b ON b."id" = e."itemId"
    WHERE e."foundQuantity" IS NULL OR e."foundQuantity" > b."quantity"),
  'an inventory count entry of a fused group does not say how many it found');
SELECT pg_temp.slot_fail_if(
  EXISTS (
    SELECT 1 FROM slot_wishes w0 LEFT JOIN slot_fate x ON x.old_id = w0."acquiredItemId"
    JOIN "wishlist_items" w ON w."id" = w0."id"
    WHERE w."acquiredItemId" IS DISTINCT FROM coalesce(x.new_id, w0."acquiredItemId")),
  'a wishlist link does not follow its unit');
SELECT pg_temp.slot_fail_if(
  EXISTS (
    SELECT 1 FROM slot_units u0 JOIN "bottles" b ON b."id" = u0."id"
    LEFT JOIN slot_fate x ON x.old_id = u0."parentItemId"
    WHERE b."parentItemId" IS DISTINCT FROM x.new_id),
  'a sub-record does not point at what became of its group');

-- Slots: every cell kept is held by what became of its unit, same cellar,
-- column, row and trash state, and nothing else holds one.
SELECT pg_temp.slot_fail_if(
  EXISTS (
    (SELECT x.new_id, s."cellarId", s.col, s.row_, s."deletedAt" FROM slot_before s JOIN slot_fate x ON x.old_id = s."id"
     EXCEPT ALL
     SELECT "itemId", "cellarId", "column", "row", "deletedAt" FROM "item_slots")
    UNION ALL
    (SELECT "itemId", "cellarId", "column", "row", "deletedAt" FROM "item_slots"
     EXCEPT ALL
     SELECT x.new_id, s."cellarId", s.col, s.row_, s."deletedAt" FROM slot_before s JOIN slot_fate x ON x.old_id = s."id")),
  'an occupied slot of the cellar plan was lost or moved');
SELECT pg_temp.slot_fail_if(
  EXISTS (SELECT 1 FROM "item_slots" s JOIN "bottles" b ON b."id" = s."itemId"
          WHERE s."deletedAt" IS DISTINCT FROM b."deletedAt"),
  'a slot is not in the trash exactly when its unit is');
SELECT pg_temp.slot_fail_if(
  EXISTS (SELECT 1 FROM "bottles" b WHERE "item_slots_violation"(b."id") IS NOT NULL),
  'a unit holds more slots than its copies in stock');

-- ---------------------------------------------------------------------------
-- 5. The guard, from now on: at every commit, the units whose slots or state
-- changed hold no more live slots than their capacity (item_slots_violation).
-- The API frees slots first and answers with typed errors; this trigger is
-- the last resort against a path that forgets to (the class of #573).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "item_slots_guard"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  problem TEXT;
BEGIN
  IF TG_TABLE_NAME = 'item_slots' THEN
    problem := "item_slots_violation"(NEW."itemId");
  ELSE
    problem := "item_slots_violation"(NEW."id");
  END IF;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'item_slots_guard: %', problem USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "item_slots_guard" AFTER INSERT OR UPDATE ON "item_slots"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "item_slots_guard"();
CREATE CONSTRAINT TRIGGER "item_slots_guard_unit"
  AFTER UPDATE OF "quantity", "isOpened", "fillLevel", "writtenOffAt", "cigarsPerBox", "deletedAt" ON "bottles"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "item_slots_guard"();

-- ---------------------------------------------------------------------------
-- 6. Counts for the release notes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT * FROM slot_counts ORDER BY what LOOP
    RAISE NOTICE 'slots: %: %', c.what, c.n;
  END LOOP;
END $$;

DROP INDEX "slot_tmp_audit_logs_bottleId";
DROP INDEX "slot_tmp_inventory_count_entries_itemId";
DROP FUNCTION pg_temp.slot_fail_if(BOOLEAN, TEXT);
DROP FUNCTION pg_temp.fam_spend(NUMERIC, INT);
DROP FUNCTION pg_temp.fam_value(NUMERIC, NUMERIC, INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_units(INT, INT, INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_copies(INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_is_intact(BOOLEAN, INT, INT);
DROP FUNCTION pg_temp.fam_group_key(TEXT, TEXT, NUMERIC, DATE, TEXT, INT, BOOLEAN);
DROP FUNCTION pg_temp.fam_product_key(TEXT, TEXT, TEXT, INT, TEXT);
DROP FUNCTION pg_temp.fam_norm_set(TEXT[]);
DROP FUNCTION pg_temp.fam_norm(TEXT);

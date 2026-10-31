-- #471 (FEAT-94), transform step of the families model: turns the one-family-
-- per-record state left by families_expand into real families and groups,
-- following design.md "Sauvegarde & Migration" (rules 1 to 9) and the
-- technical decisions D2 (grouping), D3 (family fields), D4 (splits), D5
-- (group identity), D26 (empty values in the key) and QP6 (bulk presets).
--
--   1. families: records of the same product key are grouped, in a fixed
--      order, into the first family whose accumulated description does not
--      contradict theirs (D2); the family fields are merged (D3);
--   2. FEAT-87 references become families without units;
--   3. counts: an empty or negative bottle count is 1; a cigar record (a box
--      whose count was the cigars left) becomes one box of that many cigars;
--   4. an opened or finished record counting N > 1 is split: it keeps its id
--      and state as x1, and a new full group of N-1 is flagged for review (D4);
--   5. identical full groups of a family are fused, except groups in a slot
--      of the cellar plan or counted in the same inventory session;
--   6. bulk presets that wrote a state (opened, level, opening date) are deleted;
--   7. the description mirror on `bottles` is copied again from the families.
--
-- Every figure the members rely on (units, value and spending per category,
-- tastings, history, slots, collections, inventory counts, wishlist links) is
-- recorded before and checked after: any difference raises an exception and
-- rolls the whole migration back. Counts for the release notes are logged
-- with RAISE NOTICE.
--
-- Forward only: going back means restoring the backup taken before the
-- update. Applied entirely or not at all, in one transaction, but WITHOUT an
-- explicit BEGIN / COMMIT: `prisma migrate deploy` sends the file as one
-- simple query, which PostgreSQL runs as a single transaction. With an
-- explicit BEGIN, a failed check leaves that transaction aborted, Prisma's
-- own bookkeeping then fails on it and the administrator only reads "current
-- transaction is aborted" instead of the reason (the migration bench checks
-- the failure path: full rollback, the reason shown, P3009 on restart).

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
CREATE FUNCTION pg_temp.fam_fail_if(failed BOOLEAN, message TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF failed THEN
    RAISE EXCEPTION 'families_transform: %. The migration was rolled back: no data was changed.', message;
  END IF;
END $$;

-- Temporary tables live until the end of the migration's transaction.
CREATE TEMP TABLE fam_counts (what TEXT PRIMARY KEY, n BIGINT NOT NULL) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 0. The state families_expand leaves: one family per record.
-- ---------------------------------------------------------------------------
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" GROUP BY "productId" HAVING count(*) > 1)
  OR EXISTS (SELECT 1 FROM "products" p WHERE NOT EXISTS (SELECT 1 FROM "bottles" b WHERE b."productId" = p."id")),
  'expected one family per record, as families_expand leaves them');

-- ---------------------------------------------------------------------------
-- 1. Before: what the members have, counted as rule 3 will turn it.
-- ---------------------------------------------------------------------------
-- In stock: not in the trash, owned, not finished. A bottle record counts
-- `quantity` bottles (1 when empty or below 1), one fewer when finished (the
-- finished bottle is split from the others). A cigar record is one box of
-- `quantity` cigars (1 when empty), finished at 0. Value and spending per
-- exemplar: a bottle, or a cigar box.
CREATE TEMP TABLE fam_before_rows ON COMMIT DROP AS
SELECT
  b."category"::TEXT AS category,
  q.finished,
  CASE WHEN b."category" = 'cigar' THEN
    CASE WHEN q.finished OR q.n <= 0 THEN 0 ELSE q.n END
  ELSE greatest(q.n, 1) - CASE WHEN q.finished THEN 1 ELSE 0 END END AS units,
  CASE WHEN b."category" = 'cigar' THEN
    CASE WHEN q.finished OR q.n <= 0 THEN 0 ELSE 1 END
  ELSE greatest(q.n, 1) - CASE WHEN q.finished THEN 1 ELSE 0 END END AS exemplars,
  CASE WHEN b."category" = 'cigar' THEN 1 ELSE greatest(q.n, 1) END AS bought,
  b."estimatedValue", b."purchasePrice"
FROM "bottles" b
CROSS JOIN LATERAL (SELECT coalesce(b."quantity", 1) AS n, b."isOpened" AND b."fillLevel" = 0 AS finished) q
WHERE b."deletedAt" IS NULL AND b."isOwned";

CREATE TEMP TABLE fam_before ON COMMIT DROP AS
SELECT category,
  sum(units) AS units,
  sum(coalesce("estimatedValue", "purchasePrice", 0) * exemplars) AS value,
  sum(coalesce("purchasePrice", 0) * bought) AS spend
FROM fam_before_rows GROUP BY category;

-- Every record and where its links point, to check nothing is lost.
CREATE TEMP TABLE fam_records ON COMMIT DROP AS
SELECT "id", "productId", "category", "isOwned", "deletedAt", "slotColumn", "slotRow", "cellarId",
  -- A cigar box with no cigar left becomes a finished box, which frees its slot.
  ("category" = 'cigar' AND coalesce("quantity", 1) <= 0) AS emptied_box
FROM "bottles";
CREATE TEMP TABLE fam_tastings ON COMMIT DROP AS SELECT "id", "itemId", "productId" FROM "tasting_notes";
CREATE TEMP TABLE fam_logs ON COMMIT DROP AS SELECT "id", "bottleId", "productId" FROM "audit_logs";
CREATE TEMP TABLE fam_links ON COMMIT DROP AS SELECT "A", "B" FROM "_CollectionProducts";
CREATE TEMP TABLE fam_entries ON COMMIT DROP AS
  SELECT "id", "itemId" FROM "inventory_count_entries" WHERE "itemId" IS NOT NULL;
CREATE TEMP TABLE fam_wishes ON COMMIT DROP AS
  SELECT "id", "acquiredItemId" FROM "wishlist_items" WHERE "acquiredItemId" IS NOT NULL;
-- The families as they were (one per record), the source of every merge.
CREATE TEMP TABLE fam_products ON COMMIT DROP AS SELECT * FROM "products";

-- ---------------------------------------------------------------------------
-- 2. Families (rule 2, D2). Within one product key, records are taken by
-- creation date then id, the ones in the trash last; each joins the first
-- family already formed whose accumulated description (every non-empty value
-- retained so far) agrees with its own on every compared field, or opens a
-- new one. Comparing with the accumulated description, not record to record,
-- keeps A (region X) and C (region Y) apart even with B (no region) between.
-- Not compared: name and producer (in the key), photo, notes, tags,
-- collections, the legacy `collection` label and the fields of D3.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE fam_rec ON COMMIT DROP AS
SELECT
  p."id" AS product_id,
  b."id" AS item_id,
  pg_temp.fam_product_key(p."category"::TEXT, p."producer", p."name", p."vintage", p."format") AS k,
  b."deletedAt" IS NOT NULL AS trashed,
  b."isOwned" AS owned,
  b."createdAt",
  -- Compared values, normalised; an empty value is left out (never a disagreement).
  jsonb_strip_nulls(jsonb_build_object(
    'vintage', p."vintage",
    'color', pg_temp.fam_norm(p."color"),
    'region', pg_temp.fam_norm(p."region"),
    'grapeVarieties', pg_temp.fam_norm_set(p."grapeVarieties"),
    'alcoholDegree', p."alcoholDegree",
    'needsAeration', p."needsAeration",
    'serviceTemp', pg_temp.fam_norm(p."serviceTemp"),
    'lotNumber', pg_temp.fam_norm(p."lotNumber"),
    'batchDate', p."batchDate",
    'appellation', pg_temp.fam_norm(p."appellation"),
    'classification', pg_temp.fam_norm(p."classification"),
    'sparklingType', pg_temp.fam_norm(p."sparklingType"),
    'sugarLevel', pg_temp.fam_norm(p."sugarLevel"),
    'disgorgingDate', p."disgorgingDate",
    'baseYear', p."baseYear",
    'spiritType', pg_temp.fam_norm(p."spiritType"),
    'edition', pg_temp.fam_norm(p."edition"),
    'declaredAge', p."declaredAge",
    'caskType', pg_temp.fam_norm(p."caskType"),
    'additions', pg_temp.fam_norm(p."additions"),
    'aromaticProfile', pg_temp.fam_norm(p."aromaticProfile"),
    'isSingleCask', p."isSingleCask",
    'caskNumber', pg_temp.fam_norm(p."caskNumber"),
    'caskProof', p."caskProof",
    'format', pg_temp.fam_norm(p."format"),
    'manufactureYear', p."manufactureYear",
    'leafOrigin', pg_temp.fam_norm(p."leafOrigin"),
    'factoryCode', pg_temp.fam_norm(p."factoryCode"),
    'recommendedHumidity', p."recommendedHumidity",
    'humidificationSystem', pg_temp.fam_norm(p."humidificationSystem"),
    'peakMaturityFrom', p."peakMaturityFrom",
    'peakMaturityTo', p."peakMaturityTo"
  )) AS d
FROM "products" p JOIN "bottles" b ON b."productId" = p."id";

-- fam: the family, named by its first record's family (which survives).
-- live: the family has a record out of the trash; held: one of them is owned.
CREATE TEMP TABLE fam_cum (fam TEXT PRIMARY KEY, k TEXT NOT NULL, seq INT NOT NULL, d JSONB NOT NULL,
  live BOOLEAN NOT NULL, held BOOLEAN NOT NULL) ON COMMIT DROP;
CREATE INDEX ON fam_cum (k, seq);
-- rank: position in the walk, the order "first non-empty value" follows.
CREATE TEMP TABLE fam_of (product_id TEXT PRIMARY KEY, fam TEXT NOT NULL, rank INT NOT NULL) ON COMMIT DROP;

DO $$
DECLARE
  r RECORD;
  target TEXT;
  n INT := 0;
BEGIN
  FOR r IN SELECT * FROM fam_rec ORDER BY k COLLATE "C", trashed, "createdAt", item_id COLLATE "C" LOOP
    n := n + 1;
    SELECT c.fam INTO target FROM fam_cum c
    WHERE c.k = r.k
      -- A record in the trash never joins a family that is only known
      -- without a bottle (live references alone): its trashed units would
      -- make the whole family look trashed and hide the reference's tastings.
      AND (NOT r.trashed OR c.held OR NOT c.live)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(c.d) AS x JOIN jsonb_each(r.d) AS y ON y.key = x.key
        WHERE x.value <> y.value)
    ORDER BY c.seq LIMIT 1;
    IF target IS NULL THEN
      INSERT INTO fam_cum VALUES (r.product_id, r.k, n, r.d, NOT r.trashed, NOT r.trashed AND r.owned);
      target := r.product_id;
    ELSE
      UPDATE fam_cum SET d = r.d || d, live = live OR NOT r.trashed, held = held OR (NOT r.trashed AND r.owned)
      WHERE fam = target;
    END IF;
    INSERT INTO fam_of VALUES (r.product_id, target, n);
  END LOOP;
END $$;

-- Lookups by family and by record below are joins on these temporary
-- tables: without indexes and statistics the planner loops over them, and
-- the migration grows with the square of the records (minutes for 20,000).
CREATE INDEX ON fam_of (fam);
CREATE UNIQUE INDEX ON fam_products ("id");
ANALYZE fam_of;
ANALYZE fam_products;

CREATE TEMP TABLE fam_multi ON COMMIT DROP AS
SELECT fam FROM fam_of GROUP BY fam HAVING count(*) > 1;

-- The merged family (D3). Description: per field, the first non-empty value
-- in walk order (they all agree). Photo: the most recent non-empty one, the
-- others kept in otherPhotoUrls. Notes: put end to end by date, each dated.
-- Tags, locks: union. Alerts paused only if all were; postponed until: empty
-- if one is empty, else the nearest; reminder: the nearest; curve: the most
-- recently changed record's.
CREATE TEMP TABLE fam_merged ON COMMIT DROP AS
SELECT
  o.fam,
  (array_agg(m."vintage" ORDER BY o.rank) FILTER (WHERE m."vintage" IS NOT NULL))[1] AS "vintage",
  (array_agg(m."color" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."color") IS NOT NULL))[1] AS "color",
  (array_agg(m."region" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."region") IS NOT NULL))[1] AS "region",
  (array_agg(m."alcoholDegree" ORDER BY o.rank) FILTER (WHERE m."alcoholDegree" IS NOT NULL))[1] AS "alcoholDegree",
  (array_agg(m."needsAeration" ORDER BY o.rank) FILTER (WHERE m."needsAeration" IS NOT NULL))[1] AS "needsAeration",
  (array_agg(m."serviceTemp" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."serviceTemp") IS NOT NULL))[1] AS "serviceTemp",
  (array_agg(m."lotNumber" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."lotNumber") IS NOT NULL))[1] AS "lotNumber",
  (array_agg(m."batchDate" ORDER BY o.rank) FILTER (WHERE m."batchDate" IS NOT NULL))[1] AS "batchDate",
  (array_agg(m."appellation" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."appellation") IS NOT NULL))[1] AS "appellation",
  (array_agg(m."classification" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."classification") IS NOT NULL))[1] AS "classification",
  (array_agg(m."sparklingType" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."sparklingType") IS NOT NULL))[1] AS "sparklingType",
  (array_agg(m."sugarLevel" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."sugarLevel") IS NOT NULL))[1] AS "sugarLevel",
  (array_agg(m."disgorgingDate" ORDER BY o.rank) FILTER (WHERE m."disgorgingDate" IS NOT NULL))[1] AS "disgorgingDate",
  (array_agg(m."baseYear" ORDER BY o.rank) FILTER (WHERE m."baseYear" IS NOT NULL))[1] AS "baseYear",
  (array_agg(m."spiritType" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."spiritType") IS NOT NULL))[1] AS "spiritType",
  (array_agg(m."edition" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."edition") IS NOT NULL))[1] AS "edition",
  (array_agg(m."declaredAge" ORDER BY o.rank) FILTER (WHERE m."declaredAge" IS NOT NULL))[1] AS "declaredAge",
  (array_agg(m."caskType" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."caskType") IS NOT NULL))[1] AS "caskType",
  (array_agg(m."additions" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."additions") IS NOT NULL))[1] AS "additions",
  (array_agg(m."aromaticProfile" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."aromaticProfile") IS NOT NULL))[1] AS "aromaticProfile",
  (array_agg(m."isSingleCask" ORDER BY o.rank) FILTER (WHERE m."isSingleCask" IS NOT NULL))[1] AS "isSingleCask",
  (array_agg(m."caskNumber" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."caskNumber") IS NOT NULL))[1] AS "caskNumber",
  (array_agg(m."caskProof" ORDER BY o.rank) FILTER (WHERE m."caskProof" IS NOT NULL))[1] AS "caskProof",
  (array_agg(m."format" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."format") IS NOT NULL))[1] AS "format",
  (array_agg(m."manufactureYear" ORDER BY o.rank) FILTER (WHERE m."manufactureYear" IS NOT NULL))[1] AS "manufactureYear",
  (array_agg(m."leafOrigin" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."leafOrigin") IS NOT NULL))[1] AS "leafOrigin",
  (array_agg(m."factoryCode" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."factoryCode") IS NOT NULL))[1] AS "factoryCode",
  (array_agg(m."recommendedHumidity" ORDER BY o.rank) FILTER (WHERE m."recommendedHumidity" IS NOT NULL))[1] AS "recommendedHumidity",
  (array_agg(m."humidificationSystem" ORDER BY o.rank) FILTER (WHERE pg_temp.fam_norm(m."humidificationSystem") IS NOT NULL))[1] AS "humidificationSystem",
  (array_agg(m."peakMaturityFrom" ORDER BY o.rank) FILTER (WHERE m."peakMaturityFrom" IS NOT NULL))[1] AS "peakMaturityFrom",
  (array_agg(m."peakMaturityTo" ORDER BY o.rank) FILTER (WHERE m."peakMaturityTo" IS NOT NULL))[1] AS "peakMaturityTo",
  (array_agg(m."curveShape" ORDER BY m."updatedAt" DESC, o.rank) FILTER (WHERE m."curveShape" IS NOT NULL))[1] AS "curveShape",
  bool_and(m."alertsPaused") AS "alertsPaused",
  CASE WHEN bool_or(m."consumptionPostponedUntil" IS NULL) THEN NULL ELSE min(m."consumptionPostponedUntil") END
    AS "consumptionPostponedUntil",
  min(m."reminderDate") AS "reminderDate",
  (array_agg(m."photoUrl" ORDER BY m."updatedAt" DESC, o.rank) FILTER (WHERE nullif(btrim(m."photoUrl"), '') IS NOT NULL))[1]
    AS "photoUrl",
  (array_agg(m."updatedBy" ORDER BY m."updatedAt" DESC, o.rank) FILTER (WHERE m."updatedBy" IS NOT NULL))[1] AS "updatedBy",
  min(m."createdAt") AS "createdAt",
  max(m."updatedAt") AS "updatedAt"
FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
WHERE o.fam IN (SELECT fam FROM fam_multi)
GROUP BY o.fam;

ALTER TABLE fam_merged
  ADD COLUMN "grapeVarieties" TEXT[], ADD COLUMN "tags" TEXT[], ADD COLUMN "lockedFields" TEXT[],
  ADD COLUMN "otherPhotoUrls" TEXT[], ADD COLUMN "notes" TEXT, ADD COLUMN "collection" TEXT,
  ADD COLUMN labels TEXT[], ADD COLUMN kept INT;

-- The legacy free-text label (`collection`, at most 200 characters in the
-- form): its distinct values, normalised, in walk order, joined by " / ".
-- When they do not fit, the label keeps those that do and the notes get every
-- one of them, so none is lost.
UPDATE fam_merged f SET labels = ARRAY(
  SELECT label FROM (
    SELECT DISTINCT ON (pg_temp.fam_norm(m."collection")) btrim(m."collection") AS label, o.rank
    FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
    WHERE o.fam = f.fam AND pg_temp.fam_norm(m."collection") IS NOT NULL
    ORDER BY pg_temp.fam_norm(m."collection"), o.rank) s
  ORDER BY rank);
-- kept: how many labels fit; the first always stays, even alone longer.
UPDATE fam_merged f SET kept = (
  SELECT coalesce(max(i), 0) FROM generate_series(1, coalesce(cardinality(f.labels), 0)) AS i
  WHERE i = 1 OR length(array_to_string(f.labels[1:i], ' / ')) <= 200);
UPDATE fam_merged f SET "collection" = nullif(array_to_string(f.labels[1:f.kept], ' / '), '');

UPDATE fam_merged f SET
  "grapeVarieties" = coalesce((
    SELECT m."grapeVarieties" FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
    WHERE o.fam = f.fam AND pg_temp.fam_norm_set(m."grapeVarieties") IS NOT NULL
    ORDER BY o.rank LIMIT 1), '{}'),
  "tags" = ARRAY(
    SELECT t FROM (
      SELECT DISTINCT ON (x.t) x.t, o.rank, x.i
      FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
      CROSS JOIN LATERAL unnest(m."tags") WITH ORDINALITY AS x(t, i)
      WHERE o.fam = f.fam ORDER BY x.t, o.rank, x.i) s
    ORDER BY rank, i),
  "lockedFields" = ARRAY(
    SELECT l FROM (
      SELECT DISTINCT ON (x.l) x.l, o.rank, x.i
      FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
      CROSS JOIN LATERAL unnest(m."lockedFields") WITH ORDINALITY AS x(l, i)
      WHERE o.fam = f.fam ORDER BY x.l, o.rank, x.i) s
    ORDER BY rank, i),
  "otherPhotoUrls" = ARRAY(
    SELECT u FROM (
      SELECT DISTINCT ON (x.u) x.u, x.at, x.rank
      FROM (
        SELECT m."photoUrl" AS u, m."updatedAt" AS at, o.rank
        FROM fam_of o JOIN fam_products m ON m."id" = o.product_id WHERE o.fam = f.fam
        UNION ALL
        SELECT op, m."updatedAt", o.rank
        FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
        CROSS JOIN LATERAL unnest(m."otherPhotoUrls") AS op WHERE o.fam = f.fam
      ) x
      WHERE nullif(btrim(x.u), '') IS NOT NULL AND x.u IS DISTINCT FROM f."photoUrl"
      ORDER BY x.u, x.at DESC, x.rank) s
    ORDER BY at DESC, rank),
  -- Identical notes are kept once. A single note is kept as it was; several
  -- are each preceded by the day their record was created (Europe/Paris, as
  -- the purchase day of D6), oldest first.
  "notes" = (
    SELECT CASE WHEN count(*) = 1 THEN min(s.notes)
      ELSE string_agg(to_char(s.day, 'YYYY-MM-DD') || E'\n' || s.notes, E'\n\n' ORDER BY s.day, s.rank) END
    FROM (
      SELECT DISTINCT ON (btrim(m."notes")) btrim(m."notes") AS notes, o.rank,
        (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::DATE AS day
      FROM fam_of o JOIN fam_products m ON m."id" = o.product_id
      WHERE o.fam = f.fam AND nullif(btrim(m."notes"), '') IS NOT NULL
      ORDER BY btrim(m."notes"), m."createdAt", o.rank) s);

UPDATE fam_merged f SET "notes" = concat_ws(E'\n\n', f."notes",
  to_char((now() AT TIME ZONE 'Europe/Paris')::DATE, 'YYYY-MM-DD') || E'\n'
    || 'Libellés d''origine : ' || array_to_string(f.labels, ' / '))
WHERE cardinality(f.labels) > f.kept;

UPDATE "products" p SET
  "collection" = f."collection", "tags" = f."tags", "photoUrl" = f."photoUrl",
  "otherPhotoUrls" = f."otherPhotoUrls", "notes" = f."notes",
  "vintage" = f."vintage", "color" = f."color", "region" = f."region",
  "grapeVarieties" = f."grapeVarieties", "alcoholDegree" = f."alcoholDegree",
  "needsAeration" = f."needsAeration", "serviceTemp" = f."serviceTemp",
  "lotNumber" = f."lotNumber", "batchDate" = f."batchDate", "appellation" = f."appellation",
  "classification" = f."classification", "sparklingType" = f."sparklingType",
  "sugarLevel" = f."sugarLevel", "disgorgingDate" = f."disgorgingDate", "baseYear" = f."baseYear",
  "spiritType" = f."spiritType", "edition" = f."edition", "declaredAge" = f."declaredAge",
  "caskType" = f."caskType", "additions" = f."additions", "aromaticProfile" = f."aromaticProfile",
  "isSingleCask" = f."isSingleCask", "caskNumber" = f."caskNumber", "caskProof" = f."caskProof",
  "format" = f."format", "manufactureYear" = f."manufactureYear", "leafOrigin" = f."leafOrigin",
  "factoryCode" = f."factoryCode", "recommendedHumidity" = f."recommendedHumidity",
  "humidificationSystem" = f."humidificationSystem",
  "peakMaturityFrom" = f."peakMaturityFrom", "peakMaturityTo" = f."peakMaturityTo",
  "curveShape" = f."curveShape", "alertsPaused" = f."alertsPaused",
  "consumptionPostponedUntil" = f."consumptionPostponedUntil", "reminderDate" = f."reminderDate",
  -- Recomputed as alert.service.ts#computeAlertStatus does, in the images' zone.
  "alertStatus" = CASE
    WHEN f."peakMaturityFrom" IS NULL AND f."peakMaturityTo" IS NULL THEN 'none'
    WHEN y.now < coalesce(f."peakMaturityFrom", f."peakMaturityTo") THEN 'approaching'
    WHEN y.now > coalesce(f."peakMaturityTo", f."peakMaturityFrom") THEN 'past'
    ELSE 'peak' END::"AlertStatus",
  "lockedFields" = f."lockedFields", "updatedBy" = f."updatedBy",
  "createdAt" = f."createdAt", "updatedAt" = f."updatedAt"
FROM fam_merged f
CROSS JOIN (SELECT extract(YEAR FROM now() AT TIME ZONE 'Europe/Paris')::INT AS now) y
WHERE p."id" = f.fam;

-- Field sources: per field, the source of the record whose value the family
-- kept (equal value, first in walk order), else of the first record that had
-- one (merged lists such as tags).
UPDATE "products" p SET "fieldSources" = s.sources
FROM (
  SELECT fam, jsonb_object_agg(key, value) AS sources
  FROM (
    SELECT DISTINCT ON (o.fam, fs.key) o.fam, fs.key, fs.value
    FROM fam_of o
    JOIN fam_products m ON m."id" = o.product_id
    JOIN "products" kept ON kept."id" = o.fam
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(m."fieldSources") = 'object' THEN m."fieldSources" ELSE '{}' END) AS fs
    WHERE o.fam IN (SELECT fam FROM fam_multi)
    ORDER BY o.fam, fs.key,
      (to_jsonb(m) -> fs.key) IS NOT DISTINCT FROM (to_jsonb(kept) -> fs.key) DESC, o.rank
  ) x
  GROUP BY fam
) s
WHERE p."id" = s.fam;

-- Tastings, history and collections move to the family; then every record
-- points at it and the families of the merged records are deleted.
UPDATE "tasting_notes" t SET "productId" = o.fam
FROM fam_of o WHERE t."productId" = o.product_id AND o.fam <> o.product_id;
UPDATE "audit_logs" a SET "productId" = o.fam
FROM fam_of o WHERE a."productId" = o.product_id AND o.fam <> o.product_id;
INSERT INTO "_CollectionProducts" ("A", "B")
SELECT DISTINCT cp."A", o.fam
FROM "_CollectionProducts" cp JOIN fam_of o ON o.product_id = cp."B"
WHERE o.fam <> o.product_id
ON CONFLICT DO NOTHING;
UPDATE "bottles" b SET "productId" = o.fam
FROM fam_of o WHERE b."productId" = o.product_id AND o.fam <> o.product_id;
DELETE FROM "products" p USING fam_of o WHERE p."id" = o.product_id AND o.fam <> o.product_id;

INSERT INTO fam_counts
SELECT 'families', count(*) FROM "products"
UNION ALL
SELECT 'records merged into another family', count(*) FROM fam_of WHERE fam <> product_id
UNION ALL
-- Longer than the form accepts (notes 2,000 characters, 20 tags): shown and
-- kept, but the member must shorten them before saving the description.
SELECT 'merged families with notes over 2000 characters', count(*) FROM fam_merged WHERE length("notes") > 2000
UNION ALL
SELECT 'merged families with more than 20 tags', count(*) FROM fam_merged WHERE cardinality("tags") > 20
UNION ALL
-- "À regrouper ?": families of the same key left apart by a disagreement.
SELECT 'families left apart by a disagreement ("À regrouper ?")', coalesce(sum(n), 0)
FROM (SELECT count(*) AS n FROM fam_cum GROUP BY k HAVING count(*) > 1) s;

-- ---------------------------------------------------------------------------
-- 3. FEAT-87 references (rule 5): the family stays, without units. Its
-- tastings and history are already on it; the record goes.
-- ---------------------------------------------------------------------------
-- Deleting records checks every table pointing at them; two of these
-- columns have no index (dropped at the end).
CREATE INDEX "fam_tmp_audit_logs_bottleId" ON "audit_logs" ("bottleId");
CREATE INDEX "fam_tmp_inventory_count_entries_itemId" ON "inventory_count_entries" ("itemId");

CREATE TEMP TABLE fam_refs ON COMMIT DROP AS SELECT "id", "productId" FROM "bottles" WHERE NOT "isOwned";

UPDATE "tasting_notes" SET "itemId" = NULL WHERE "itemId" IN (SELECT "id" FROM fam_refs);
UPDATE "audit_logs" SET "bottleId" = NULL WHERE "bottleId" IN (SELECT "id" FROM fam_refs);
UPDATE "wishlist_items" SET "acquiredItemId" = NULL WHERE "acquiredItemId" IN (SELECT "id" FROM fam_refs);
UPDATE "bottles" SET "parentItemId" = NULL WHERE "parentItemId" IN (SELECT "id" FROM fam_refs);
-- A reference was never counted in an inventory session; an entry left from
-- before it became one has no unit to point at any more.
WITH gone AS (DELETE FROM "inventory_count_entries" WHERE "itemId" IN (SELECT "id" FROM fam_refs) RETURNING 1)
INSERT INTO fam_counts SELECT 'inventory entries of references removed', count(*) FROM gone;
DELETE FROM "bottles" WHERE "id" IN (SELECT "id" FROM fam_refs);

-- A family left with no unit whose records were all in the trash stays in the trash.
UPDATE "products" p SET "deletedAt" = s.at
FROM (
  SELECT o.fam, max(r."deletedAt") AS at
  FROM fam_of o JOIN fam_records r ON r."productId" = o.product_id
  GROUP BY o.fam HAVING bool_and(r."deletedAt" IS NOT NULL)
) s
WHERE p."id" = s.fam AND NOT EXISTS (SELECT 1 FROM "bottles" b WHERE b."productId" = p."id");

INSERT INTO fam_counts
SELECT 'references turned into wines without bottles', count(*) FROM fam_refs
UNION ALL
SELECT 'families without any unit', count(*) FROM "products" p
WHERE NOT EXISTS (SELECT 1 FROM "bottles" b WHERE b."productId" = p."id");

-- ---------------------------------------------------------------------------
-- 4. Counts (rule 3). Bottles: an empty or negative count is 1. Cigars: a
-- record was a box whose count was the cigars left; it becomes one box of
-- that many cigars (the box's original size is unknown), closed if it was
-- not opened, else opened with that many left. A box with no cigar left
-- becomes a finished box, which frees its slot. Prices and values per box
-- are unchanged, and so is every cigar count.
-- ---------------------------------------------------------------------------
UPDATE "bottles" SET "quantity" = 1
WHERE "category" <> 'cigar' AND ("quantity" IS NULL OR "quantity" < 1);

INSERT INTO fam_counts SELECT 'cigar boxes converted', count(*) FROM "bottles" WHERE "category" = 'cigar';

UPDATE "bottles" b SET
  "quantity" = 1,
  "cigarsPerBox" = CASE WHEN c.n <= 0 THEN NULL ELSE c.n END,
  "cigarsLeft" = CASE
    WHEN c.n <= 0 THEN NULL
    WHEN c.finished THEN 0
    WHEN b."isOpened" THEN c.n
  END,
  "isOpened" = b."isOpened" OR c.n <= 0,
  "fillLevel" = CASE WHEN c.finished OR c.n <= 0 THEN 0 END,
  "openedAt" = CASE WHEN c.n <= 0 THEN coalesce(b."openedAt", b."updatedAt") ELSE b."openedAt" END,
  "slotColumn" = CASE WHEN c.n <= 0 THEN NULL ELSE b."slotColumn" END,
  "slotRow" = CASE WHEN c.n <= 0 THEN NULL ELSE b."slotRow" END
FROM (
  SELECT "id", coalesce("quantity", 1) AS n, "isOpened" AND "fillLevel" = 0 AS finished
  FROM "bottles" WHERE "category" = 'cigar'
) c
WHERE b."id" = c."id";

-- ---------------------------------------------------------------------------
-- 5. Splits (rule 3, D4). An opened or finished bottle record counting N > 1
-- keeps its id, state, slot, tastings, history and inventory entries as the
-- x1 sub-record; a new full group of N-1 (same cellar, price, purchase day,
-- value and place, no slot, same trash state) is its group of origin. Only
-- the group is flagged for review: its count is the guess.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE fam_split ON COMMIT DROP AS
SELECT "id" AS item_id, gen_random_uuid()::TEXT AS group_id
FROM "bottles"
WHERE "category" <> 'cigar' AND "quantity" > 1
  AND NOT pg_temp.fam_is_intact("isOpened", "fillLevel", "cigarsLeft");

INSERT INTO "bottles"
SELECT (jsonb_populate_record(b, jsonb_build_object(
  'id', s.group_id,
  'quantity', b."quantity" - 1,
  'isOpened', false,
  'fillLevel', NULL,
  'openedAt', NULL,
  'slotColumn', NULL,
  'slotRow', NULL,
  'parentItemId', NULL,
  'needsReview', true
))).*
FROM "bottles" b JOIN fam_split s ON s.item_id = b."id";

UPDATE "bottles" b SET "quantity" = 1, "parentItemId" = s.group_id
FROM fam_split s WHERE b."id" = s.item_id;

INSERT INTO "_CollectionItems" ("A", "B")
SELECT ci."A", s.group_id FROM "_CollectionItems" ci JOIN fam_split s ON s.item_id = ci."B";

INSERT INTO fam_counts SELECT 'groups split by guess, to review (needsReview)', count(*) FROM fam_split;

-- ---------------------------------------------------------------------------
-- 6. Fusion (rule 4, D5). Full groups of a family with the same identity
-- (groupKey: family, cellar, purchase price, purchase day, bottle size or box
-- size) and the same estimated value fuse into one group. Place of purchase
-- and location must not disagree (empty agrees), compared with what the group
-- has accumulated, as in step 2. Left apart: groups in the trash, guessed
-- ones (to review on their own), groups holding a slot of the cellar plan (a
-- group has one slot until FEAT-93) and groups counted in the same inventory
-- session (one entry per unit and session). The oldest group survives.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE fuse_rec ON COMMIT DROP AS
SELECT
  b."id",
  -- groupKey, plus the estimated value: a value empty on one side only would
  -- change the worth of the absorbed bottles (#594 falls back on the price).
  jsonb_build_array(
    pg_temp.fam_group_key(b."productId", b."cellarId", b."purchasePrice", b."purchasedAt", b."bottleSize",
      b."cigarsPerBox", b."category" = 'cigar'),
    b."estimatedValue"
  )::TEXT AS gk,
  b."createdAt",
  pg_temp.fam_norm(b."purchasePlace") AS place,
  pg_temp.fam_norm(b."location") AS location
FROM "bottles" b
WHERE b."deletedAt" IS NULL AND b."writtenOffAt" IS NULL AND NOT b."needsReview"
  AND b."slotColumn" IS NULL AND b."slotRow" IS NULL
  AND pg_temp.fam_is_intact(b."isOpened", b."fillLevel", b."cigarsLeft");

-- The inventory sessions each candidate is counted in.
CREATE TEMP TABLE fuse_sessions ON COMMIT DROP AS
SELECT e."itemId" AS item_id, e."sessionId" AS session_id
FROM "inventory_count_entries" e JOIN fuse_rec r ON r."id" = e."itemId";
CREATE INDEX ON fuse_sessions (item_id);
CREATE INDEX ON fuse_sessions (session_id);

CREATE TEMP TABLE fuse_grp (grp TEXT PRIMARY KEY, gk TEXT NOT NULL, seq INT NOT NULL, place TEXT, location TEXT) ON COMMIT DROP;
CREATE INDEX ON fuse_grp (gk, seq);
CREATE TEMP TABLE fuse_of (item_id TEXT PRIMARY KEY, grp TEXT NOT NULL, rank INT NOT NULL) ON COMMIT DROP;
CREATE INDEX ON fuse_of (grp);

DO $$
DECLARE
  r RECORD;
  target TEXT;
  n INT := 0;
BEGIN
  FOR r IN SELECT * FROM fuse_rec ORDER BY gk COLLATE "C", "createdAt", "id" COLLATE "C" LOOP
    n := n + 1;
    SELECT g.grp INTO target FROM fuse_grp g
    WHERE g.gk = r.gk
      AND (g.place IS NULL OR r.place IS NULL OR g.place = r.place)
      AND (g.location IS NULL OR r.location IS NULL OR g.location = r.location)
      AND NOT EXISTS (
        SELECT 1
        FROM fuse_sessions mine
        JOIN fuse_sessions theirs ON theirs.session_id = mine.session_id
        JOIN fuse_of f ON f.item_id = theirs.item_id
        WHERE mine.item_id = r."id" AND f.grp = g.grp)
    ORDER BY g.seq LIMIT 1;
    IF target IS NULL THEN
      INSERT INTO fuse_grp VALUES (r."id", r.gk, n, r.place, r.location);
      target := r."id";
    ELSE
      UPDATE fuse_grp SET place = coalesce(place, r.place), location = coalesce(location, r.location)
      WHERE grp = target;
    END IF;
    INSERT INTO fuse_of VALUES (r."id", target, n);
  END LOOP;
END $$;

DELETE FROM fuse_of WHERE grp IN (SELECT grp FROM fuse_of GROUP BY grp HAVING count(*) = 1);

-- Inventory counts (D15): an entry counted one record, which becomes part of a
-- group of N. It keeps the number it found (that record's count), so the
-- other N - found bottles still show as missing in the session, active or
-- completed, instead of the whole group being counted found (empty = all).
UPDATE "inventory_count_entries" e SET "foundQuantity" = coalesce(e."foundQuantity", m."quantity")
FROM fuse_of f JOIN "bottles" m ON m."id" = f.item_id
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
    ARRAY(SELECT DISTINCT l FROM fuse_of f2 JOIN "bottles" m2 ON m2."id" = f2.item_id,
          unnest(m2."lockedFields") AS l WHERE f2.grp = f.grp ORDER BY l) AS locks,
    (SELECT jsonb_object_agg(key, value) FROM (
       SELECT DISTINCT ON (fs.key) fs.key, fs.value
       FROM fuse_of f2 JOIN "bottles" m2 ON m2."id" = f2.item_id
       CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(m2."fieldSources") = 'object' THEN m2."fieldSources" ELSE '{}' END) AS fs
       WHERE f2.grp = f.grp ORDER BY fs.key, f2.rank) x) AS sources
  FROM fuse_of f JOIN "bottles" m ON m."id" = f.item_id
  GROUP BY f.grp
) s
WHERE b."id" = s.grp;

-- Everything attached to an absorbed group moves to the survivor.
UPDATE "tasting_notes" t SET "itemId" = f.grp FROM fuse_of f WHERE t."itemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "audit_logs" a SET "bottleId" = f.grp FROM fuse_of f WHERE a."bottleId" = f.item_id AND f.item_id <> f.grp;
UPDATE "inventory_count_entries" e SET "itemId" = f.grp FROM fuse_of f WHERE e."itemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "wishlist_items" w SET "acquiredItemId" = f.grp FROM fuse_of f WHERE w."acquiredItemId" = f.item_id AND f.item_id <> f.grp;
UPDATE "bottles" b SET "parentItemId" = f.grp FROM fuse_of f WHERE b."parentItemId" = f.item_id AND f.item_id <> f.grp;
INSERT INTO "_CollectionItems" ("A", "B")
SELECT DISTINCT ci."A", f.grp FROM "_CollectionItems" ci JOIN fuse_of f ON f.item_id = ci."B"
WHERE f.item_id <> f.grp
ON CONFLICT DO NOTHING;
DELETE FROM "bottles" b USING fuse_of f WHERE b."id" = f.item_id AND f.item_id <> f.grp;

INSERT INTO fam_counts
SELECT 'groups fused into another', count(*) FROM fuse_of WHERE item_id <> grp;

-- ---------------------------------------------------------------------------
-- 7. Bulk presets (QP6): a preset whose patch writes a state is deleted in
-- full; "Mark as drunk", which asks for the numbers, replaces it.
-- ---------------------------------------------------------------------------
WITH gone AS (
  DELETE FROM "bulk_presets"
  WHERE jsonb_typeof("payload") = 'object' AND "payload" ?| ARRAY['isOpened', 'fillLevel', 'openedAt']
  RETURNING 1)
INSERT INTO fam_counts SELECT 'bulk presets deleted (they wrote a state)', count(*) FROM gone;

-- ---------------------------------------------------------------------------
-- 8. The transitional mirror: every unit carries its family's description
-- again, and belongs to its family's collections. A plain UPDATE leaves
-- "updatedAt" alone (D22).
-- ---------------------------------------------------------------------------
UPDATE "bottles" b SET
  "category" = p."category", "name" = p."name", "producer" = p."producer",
  "collection" = p."collection", "tags" = p."tags", "photoUrl" = p."photoUrl", "notes" = p."notes",
  "vintage" = p."vintage", "color" = p."color", "region" = p."region",
  "grapeVarieties" = p."grapeVarieties", "alcoholDegree" = p."alcoholDegree",
  "needsAeration" = p."needsAeration", "serviceTemp" = p."serviceTemp",
  "lotNumber" = p."lotNumber", "batchDate" = p."batchDate", "appellation" = p."appellation",
  "classification" = p."classification", "sparklingType" = p."sparklingType",
  "sugarLevel" = p."sugarLevel", "disgorgingDate" = p."disgorgingDate", "baseYear" = p."baseYear",
  "spiritType" = p."spiritType", "edition" = p."edition", "declaredAge" = p."declaredAge",
  "caskType" = p."caskType", "additions" = p."additions", "aromaticProfile" = p."aromaticProfile",
  "isSingleCask" = p."isSingleCask", "caskNumber" = p."caskNumber", "caskProof" = p."caskProof",
  "format" = p."format", "manufactureYear" = p."manufactureYear", "leafOrigin" = p."leafOrigin",
  "factoryCode" = p."factoryCode", "recommendedHumidity" = p."recommendedHumidity",
  "humidificationSystem" = p."humidificationSystem",
  "peakMaturityFrom" = p."peakMaturityFrom", "peakMaturityTo" = p."peakMaturityTo",
  "curveShape" = p."curveShape", "alertsPaused" = p."alertsPaused",
  "consumptionPostponedUntil" = p."consumptionPostponedUntil",
  "reminderDate" = p."reminderDate", "alertStatus" = p."alertStatus"
FROM "products" p
WHERE b."productId" = p."id" AND p."id" IN (SELECT fam FROM fam_multi);

INSERT INTO "_CollectionItems" ("A", "B")
SELECT cp."A", b."id" FROM "_CollectionProducts" cp JOIN "bottles" b ON b."productId" = cp."B"
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Invariants (rule 9). Any failure rolls the whole migration back.
-- ---------------------------------------------------------------------------
-- Where each record went: itself, the group that absorbed it, or nowhere (a reference).
CREATE TEMP TABLE fam_fate ON COMMIT DROP AS
SELECT r."id" AS old_id,
  CASE WHEN NOT r."isOwned" THEN NULL ELSE coalesce(f.grp, r."id") END AS new_id,
  o.fam
FROM fam_records r
JOIN fam_of o ON o.product_id = r."productId"
LEFT JOIN fuse_of f ON f.item_id = r."id";
CREATE INDEX ON fam_fate (old_id);
CREATE INDEX ON fam_fate (fam);
ANALYZE fam_fate;

SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" WHERE "quantity" IS NULL OR "quantity" < 1),
  'a unit has no count or a count below 1');
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" WHERE "quantity" > 1 AND "writtenOffAt" IS NULL
          AND NOT pg_temp.fam_is_intact("isOpened", "fillLevel", "cigarsLeft")),
  'a unit counting more than one has a state of its own (opened, level or cigars left)');
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" WHERE "category" = 'cigar'
          AND ("cigarsLeft" < 0 OR "cigarsLeft" > "cigarsPerBox" OR ("cigarsLeft" IS NOT NULL AND NOT "isOpened"))),
  'a cigar box has more cigars left than it holds, or cigars left while closed');
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" WHERE NOT "isOwned"),
  'a non-owned reference is still a unit');
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM "bottles" c JOIN "bottles" g ON g."id" = c."parentItemId"
          WHERE g."productId" <> c."productId" OR NOT pg_temp.fam_is_intact(g."isOpened", g."fillLevel", g."cigarsLeft")),
  'a sub-record points at a group of another family, or at a unit that is not a group');
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM "products" p
    WHERE NOT EXISTS (SELECT 1 FROM "bottles" b WHERE b."productId" = p."id")
      AND NOT EXISTS (SELECT 1 FROM fam_fate x WHERE x.fam = p."id" AND x.new_id IS NULL)),
  'a family has no unit and did not come from a non-owned reference');
SELECT pg_temp.fam_fail_if(
  EXISTS (SELECT 1 FROM fam_fate x WHERE x.new_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "bottles" b WHERE b."id" = x.new_id AND b."productId" = x.fam)),
  'a record is not a unit of its family any more');

-- Units, value and spending per category, before (rule 3) and after (itemUnits, itemValue, itemSpend).
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1
    FROM fam_before bf
    FULL JOIN (
      SELECT b."category"::TEXT AS category,
        sum(pg_temp.fam_units(b."quantity", b."cigarsPerBox", b."cigarsLeft", b."isOpened", b."fillLevel", b."writtenOffAt")) AS units,
        sum(pg_temp.fam_value(b."estimatedValue", b."purchasePrice", b."quantity", b."isOpened", b."fillLevel", b."writtenOffAt")) AS value,
        sum(pg_temp.fam_spend(b."purchasePrice", b."quantity")) AS spend
      FROM "bottles" b WHERE b."deletedAt" IS NULL GROUP BY b."category"
    ) af ON af.category = bf.category
    WHERE (coalesce(bf.units, 0), coalesce(bf.value, 0), coalesce(bf.spend, 0))
      IS DISTINCT FROM (coalesce(af.units, 0), coalesce(af.value, 0), coalesce(af.spend, 0))),
  'the units, value or spending of a category differ before and after');

-- Tastings and history: none lost, each on its family and on what became of its unit (rule 8).
SELECT pg_temp.fam_fail_if(
  (SELECT count(*) FROM "tasting_notes") <> (SELECT count(*) FROM fam_tastings)
  OR EXISTS (
    SELECT 1 FROM fam_tastings t0
    LEFT JOIN "tasting_notes" t ON t."id" = t0."id"
    LEFT JOIN fam_fate x ON x.old_id = t0."itemId"
    LEFT JOIN fam_of o ON o.product_id = t0."productId"
    LEFT JOIN "bottles" b ON b."id" = t."itemId"
    WHERE t."id" IS NULL
       OR t."itemId" IS DISTINCT FROM x.new_id
       OR t."productId" IS DISTINCT FROM o.fam
       OR (t."itemId" IS NOT NULL AND t."productId" IS DISTINCT FROM b."productId")),
  'a tasting was lost or is not on the family of its bottle');
SELECT pg_temp.fam_fail_if(
  (SELECT count(*) FROM "audit_logs") <> (SELECT count(*) FROM fam_logs)
  OR EXISTS (
    SELECT 1 FROM fam_logs l0
    LEFT JOIN "audit_logs" l ON l."id" = l0."id"
    LEFT JOIN fam_fate x ON x.old_id = l0."bottleId"
    LEFT JOIN fam_of o ON o.product_id = l0."productId"
    LEFT JOIN "bottles" b ON b."id" = l."bottleId"
    WHERE l."id" IS NULL
       OR l."bottleId" IS DISTINCT FROM x.new_id
       OR l."productId" IS DISTINCT FROM o.fam
       OR (l."bottleId" IS NOT NULL AND l."productId" IS DISTINCT FROM b."productId")),
  'a history line was lost or is not on the family of its bottle');

-- Slots: every record that held one still does (it kept its id), except a
-- cigar box finished here; no other unit took one.
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM fam_records r
    LEFT JOIN "bottles" b ON b."id" = r."id"
    WHERE r."deletedAt" IS NULL AND r."isOwned" AND NOT r.emptied_box
      AND (r."slotColumn" IS NOT NULL OR r."slotRow" IS NOT NULL)
      AND (b."id" IS NULL OR (b."cellarId", b."slotColumn", b."slotRow")
           IS DISTINCT FROM (r."cellarId", r."slotColumn", r."slotRow")))
  OR (SELECT count(*) FROM "bottles" WHERE "deletedAt" IS NULL AND ("slotColumn" IS NOT NULL OR "slotRow" IS NOT NULL))
     <> (SELECT count(*) FROM fam_records WHERE "deletedAt" IS NULL AND "isOwned" AND NOT emptied_box
         AND ("slotColumn" IS NOT NULL OR "slotRow" IS NOT NULL)),
  'an occupied slot of the cellar plan was lost or moved');

-- Collections hold the family of every record they held; units mirror them.
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM fam_links l JOIN fam_of o ON o.product_id = l."B"
    WHERE NOT EXISTS (SELECT 1 FROM "_CollectionProducts" cp WHERE cp."A" = l."A" AND cp."B" = o.fam))
  OR EXISTS (
    SELECT 1 FROM "_CollectionProducts" cp JOIN "bottles" b ON b."productId" = cp."B"
    WHERE NOT EXISTS (SELECT 1 FROM "_CollectionItems" ci WHERE ci."A" = cp."A" AND ci."B" = b."id")),
  'a collection lost a wine');

-- An entry on a fused group says how many of it were found.
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM "inventory_count_entries" e JOIN fuse_of f ON f.grp = e."itemId" AND f.item_id = f.grp
    JOIN "bottles" b ON b."id" = e."itemId"
    WHERE e."foundQuantity" IS NULL OR e."foundQuantity" > b."quantity"),
  'an inventory count entry of a fused group does not say how many it found');

-- Inventory entries and wishlist links follow their unit.
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM fam_entries e0 JOIN fam_fate x ON x.old_id = e0."itemId"
    LEFT JOIN "inventory_count_entries" e ON e."id" = e0."id"
    WHERE x.new_id IS NOT NULL AND e."itemId" IS DISTINCT FROM x.new_id),
  'an inventory count entry was lost or does not follow its unit');
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM fam_wishes w0 LEFT JOIN fam_fate x ON x.old_id = w0."acquiredItemId"
    JOIN "wishlist_items" w ON w."id" = w0."id"
    WHERE w."acquiredItemId" IS DISTINCT FROM CASE WHEN x.old_id IS NULL THEN w0."acquiredItemId" ELSE x.new_id END),
  'a wishlist link does not follow its unit');

-- The mirror matches the family.
SELECT pg_temp.fam_fail_if(
  EXISTS (
    SELECT 1 FROM "bottles" b JOIN "products" p ON p."id" = b."productId"
    WHERE (b."category", b."name", b."producer", b."vintage", b."region", b."format", b."notes", b."photoUrl", b."tags")
      IS DISTINCT FROM (p."category", p."name", p."producer", p."vintage", p."region", p."format", p."notes", p."photoUrl", p."tags")),
  'a unit does not mirror the description of its family');

-- ---------------------------------------------------------------------------
-- 10. Counts for the release notes (rule 7).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT * FROM fam_counts ORDER BY what LOOP
    RAISE NOTICE 'families_transform: %: %', c.what, c.n;
  END LOOP;
END $$;

DROP INDEX "fam_tmp_audit_logs_bottleId";
DROP INDEX "fam_tmp_inventory_count_entries_itemId";
DROP FUNCTION pg_temp.fam_fail_if(BOOLEAN, TEXT);
DROP FUNCTION pg_temp.fam_spend(NUMERIC, INT);
DROP FUNCTION pg_temp.fam_value(NUMERIC, NUMERIC, INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_units(INT, INT, INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_copies(INT, BOOLEAN, INT, TIMESTAMP);
DROP FUNCTION pg_temp.fam_is_intact(BOOLEAN, INT, INT);
DROP FUNCTION pg_temp.fam_group_key(TEXT, TEXT, NUMERIC, DATE, TEXT, INT, BOOLEAN);
DROP FUNCTION pg_temp.fam_product_key(TEXT, TEXT, TEXT, INT, TEXT);
DROP FUNCTION pg_temp.fam_norm_set(TEXT[]);
DROP FUNCTION pg_temp.fam_norm(TEXT);

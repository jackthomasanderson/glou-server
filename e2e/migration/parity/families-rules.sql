-- #471 migration bench: the SQL copy of the shared rules (the "families
-- rules" block of the families_transform migration, loaded just before this
-- file) against the case table api/tests/lib/units.test.ts also reads
-- (fixtures/units-cases.json, in the `bench.cases` setting).

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

CREATE FUNCTION pg_temp.key_of(p JSONB) RETURNS TEXT AS $$
  SELECT pg_temp.fam_product_key(p ->> 'category', p ->> 'producer', p ->> 'name', (p ->> 'vintage')::INT, p ->> 'format')
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.group_of(g JSONB, kind TEXT) RETURNS TEXT AS $$
  SELECT pg_temp.fam_group_key(g ->> 'productId', g ->> 'cellarId', (g ->> 'purchasePrice')::NUMERIC,
    (g ->> 'purchasedAt')::DATE, g ->> 'bottleSize', (g ->> 'cigarsPerBox')::INT, kind = 'cigar')
$$ LANGUAGE sql;

-- productKey: SQL gives the expected answer; where marked `sqlMaySplit`, SQL
-- may only see two keys where TypeScript sees one (D2), never the reverse.
SELECT pg_temp.expect(
  CASE WHEN (c ->> 'sqlMaySplit')::BOOLEAN AND (c ->> 'same')::BOOLEAN
    THEN true
    ELSE (pg_temp.key_of(c -> 'a') = pg_temp.key_of(c -> 'b')) = (c ->> 'same')::BOOLEAN END,
  'productKey: ' || (c ->> 'case'))
FROM jsonb_array_elements(current_setting('bench.cases')::JSONB -> 'productKey') AS c;

SELECT pg_temp.expect(
  (pg_temp.group_of(c -> 'a', c ->> 'kind') = pg_temp.group_of(c -> 'b', c ->> 'kind')) = (c ->> 'same')::BOOLEAN,
  'groupKey: ' || (c ->> 'case'))
FROM jsonb_array_elements(current_setting('bench.cases')::JSONB -> 'groupKey') AS c;

-- Units, value, spend and intact, with the defaults of the file's _comment.
SELECT pg_temp.expect(
  pg_temp.fam_units(q, per_box, left_, opened, fill, off) = (c ->> 'units')::INT
  AND pg_temp.fam_value(est, price, q, opened, fill, off) = (c ->> 'value')::NUMERIC
  AND pg_temp.fam_spend(price, q) = (c ->> 'spend')::NUMERIC
  AND pg_temp.fam_is_intact(opened, fill, left_) = (c ->> 'intact')::BOOLEAN,
  'units, value, spend, intact: ' || (c ->> 'case'))
FROM jsonb_array_elements(current_setting('bench.cases')::JSONB -> 'units') AS c
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN i ? 'quantity' THEN (i ->> 'quantity')::INT ELSE 1 END AS q,
    (i ->> 'cigarsPerBox')::INT AS per_box,
    (i ->> 'cigarsLeft')::INT AS left_,
    coalesce((i ->> 'isOpened')::BOOLEAN, false) AS opened,
    (i ->> 'fillLevel')::INT AS fill,
    (i ->> 'writtenOffAt')::TIMESTAMP AS off,
    (i ->> 'purchasePrice')::NUMERIC AS price,
    (i ->> 'estimatedValue')::NUMERIC AS est
  FROM (SELECT c -> 'item' AS i) x
) v;

DO $$
DECLARE
  failed TEXT;
BEGIN
  SELECT string_agg(what, E'\n  ') INTO failed FROM failures;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'families rules parity failed:\n  %', failed;
  END IF;
END $$;

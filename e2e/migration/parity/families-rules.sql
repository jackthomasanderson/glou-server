-- #471 migration bench: the SQL copy of the shared rules (the "families
-- rules" block of the families_transform migration, loaded just before this
-- file) against the case table shared with the TypeScript tests
-- (cases/families-rules.json, in the `bench.cases` setting).

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

-- productKey: SQL agrees with the expected answer; where the locale may
-- differ, SQL may only see two keys where TypeScript sees one (D2), never
-- the reverse.
SELECT pg_temp.expect(
  CASE WHEN (c ->> 'sqlMaySplit')::BOOLEAN AND (c ->> 'sameKey')::BOOLEAN
    THEN true
    ELSE (pg_temp.key_of(c -> 'a') = pg_temp.key_of(c -> 'b')) = (c ->> 'sameKey')::BOOLEAN END,
  'productKey: ' || (c ->> 'why'))
FROM jsonb_array_elements(current_setting('bench.cases')::JSONB -> 'productKey') AS c;

SELECT pg_temp.expect(
  pg_temp.fam_units(i ->> 'category', (i ->> 'quantity')::INT, (i ->> 'cigarsPerBox')::INT, (i ->> 'cigarsLeft')::INT,
    (i ->> 'isOpened')::BOOLEAN, (i ->> 'fillLevel')::INT, (i ->> 'writtenOffAt')::TIMESTAMP) = (c ->> 'units')::INT
  AND pg_temp.fam_value((i ->> 'estimatedValue')::NUMERIC, (i ->> 'purchasePrice')::NUMERIC, (i ->> 'quantity')::INT,
    (i ->> 'cigarsLeft')::INT, (i ->> 'isOpened')::BOOLEAN, (i ->> 'fillLevel')::INT, (i ->> 'writtenOffAt')::TIMESTAMP)
    = (c ->> 'value')::NUMERIC
  AND pg_temp.fam_spend((i ->> 'purchasePrice')::NUMERIC, (i ->> 'quantity')::INT) = (c ->> 'spend')::NUMERIC,
  'units, value, spend: ' || (c ->> 'why'))
FROM jsonb_array_elements(current_setting('bench.cases')::JSONB -> 'units') AS c
CROSS JOIN LATERAL (SELECT c -> 'item' AS i) x;

DO $$
DECLARE
  failed TEXT;
BEGIN
  SELECT string_agg(what, E'\n  ') INTO failed FROM failures;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'families rules parity failed:\n  %', failed;
  END IF;
END $$;

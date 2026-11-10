-- #733: a maturity reference colour was free text ("Rouge", "Red"…) while a
-- bottle stores one of the shared colour codes (red, white, rosé, orange), so
-- a reference with a colour never matched. Map the known spellings to their
-- code; anything else cannot match a bottle and becomes "any colour" (NULL).
-- Data only, the column is unchanged. Idempotent: a code maps to itself.
-- NFC folds a decomposed "é"; 'Rosé'/'ROSÉ' are listed in case lower() leaves
-- a non-ASCII capital alone under the database collation.
UPDATE "maturity_references" AS m
SET "color" = CASE
  WHEN v.c IN ('red', 'rouge') THEN 'red'
  WHEN v.c IN ('white', 'blanc') THEN 'white'
  WHEN v.c IN ('rosé', 'rose', 'rosÉ') THEN 'rosé'
  WHEN v.c = 'orange' THEN 'orange'
  ELSE NULL
END
FROM (
  SELECT "id", lower(normalize(btrim("color"), NFC)) AS c
  FROM "maturity_references"
  WHERE "color" IS NOT NULL
) AS v
WHERE m."id" = v."id";

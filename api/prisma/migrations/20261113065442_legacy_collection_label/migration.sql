-- #468: the legacy free-text `collection` label of a wine (family) becomes
-- real collections, then the column goes. Nothing showed the label any more
-- (only the CSV export carried it), and collections replaced it long ago.
--
-- A label merged from several records reads "A / B" (families migration,
-- "À regrouper ?"): each part is its own collection. A part joins the oldest
-- collection of the same name (case and spaces aside), else a new one is
-- created, named as first written (at most 100 characters, like the form),
-- with the oldest family's author as its creator (audit only, #476). A label
-- cut to fit is also written in full at the end of the wine's notes, dated
-- today, as the families migration did, so no text is lost.

CREATE TEMP TABLE legacy_labels ON COMMIT DROP AS
SELECT p."id" AS product_id, p."userId" AS user_id, p."createdAt" AS created_at,
       btrim(part) AS full_label,
       btrim(left(btrim(part), 100)) AS label, lower(btrim(left(btrim(part), 100))) AS label_key
FROM "products" p
CROSS JOIN LATERAL unnest(string_to_array(p."collection", ' / ')) AS part
WHERE p."collection" IS NOT NULL AND btrim(part) <> '';

INSERT INTO "collections" ("id", "name", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, s.label, s.user_id, now(), now()
FROM (
  SELECT DISTINCT ON (label_key) label, label_key, user_id
  FROM legacy_labels
  ORDER BY label_key, created_at, product_id
) s
WHERE NOT EXISTS (SELECT 1 FROM "collections" c WHERE lower(btrim(c."name")) = s.label_key);

INSERT INTO "_CollectionProducts" ("A", "B")
SELECT DISTINCT
  (SELECT c."id" FROM "collections" c WHERE lower(btrim(c."name")) = l.label_key ORDER BY c."createdAt", c."id" LIMIT 1),
  l.product_id
FROM legacy_labels l
ON CONFLICT DO NOTHING;

UPDATE "products" p
SET "notes" = CASE WHEN coalesce(btrim(p."notes"), '') = '' THEN '' ELSE p."notes" || E'\n\n' END
  || to_char(now(), 'YYYY-MM-DD') || E'\nLibellés d''origine : ' || btrim(p."collection")
WHERE p."id" IN (SELECT product_id FROM legacy_labels WHERE label <> full_label)
  -- A wine merged by the families migration may already hold its full labels in its notes.
  AND strpos(coalesce(p."notes", ''), btrim(p."collection")) = 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM legacy_labels l
    WHERE NOT EXISTS (
      SELECT 1 FROM "_CollectionProducts" cp JOIN "collections" c ON c."id" = cp."A"
      WHERE cp."B" = l.product_id AND lower(btrim(c."name")) = l.label_key)
  ) OR EXISTS (
    SELECT 1 FROM legacy_labels l JOIN "products" p ON p."id" = l.product_id
    WHERE l.label <> l.full_label AND strpos(coalesce(p."notes", ''), l.full_label) = 0
  ) THEN
    RAISE EXCEPTION 'legacy collection label: a wine lost its label. The migration was rolled back: no data was changed.';
  END IF;
END $$;

ALTER TABLE "products" DROP COLUMN "collection";

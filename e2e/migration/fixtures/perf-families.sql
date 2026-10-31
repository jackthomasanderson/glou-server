-- #471 migration bench: a synthetic instance of :N records (5 records per
-- wine, 1 in 10 with a contradicting region, some opened, counted x3 or in a
-- slot), with tastings, history and a collection, to keep the families
-- migrations' duration in check (check-families-migration.sh replaces :N).
INSERT INTO "User" ("id", "username", "email", "passwordHash", "updatedAt") VALUES
  ('u1', 'alice', 'alice@example.test', 'x', now());
INSERT INTO "cellars" ("id", "name", "userId", "columns", "rows", "updatedAt") VALUES
  ('c1', 'Garage', 'u1', 200, 200, now()), ('c2', 'Kitchen', 'u1', NULL, NULL, now());
-- N records: wines w = i/5 (4000 wines x 5 records); regions mostly agree, 1 in 10 differs.
INSERT INTO "bottles" ("id", "userId", "cellarId", "category", "name", "producer", "vintage", "region",
  "tags", "notes", "photoUrl", "purchasePrice", "quantity", "isOpened", "fillLevel", "slotColumn", "slotRow",
  "fieldSources", "lockedFields", "createdAt", "updatedAt")
SELECT 'b' || i, 'u1', CASE WHEN i % 3 = 0 THEN 'c2' ELSE 'c1' END,
  (ARRAY['wine','wine','wine','sparkling','spirit','cigar'])[1 + (i/5) % 6]::"BottleCategory",
  'Wine ' || (i/5), 'Producer ' || (i/50), 2000 + (i/5) % 20,
  CASE WHEN i % 10 = 0 THEN 'Region X' WHEN i % 5 = 1 THEN NULL ELSE 'Region ' || (i/5) % 30 END,
  ARRAY['t' || (i % 7), 't' || (i % 3)], CASE WHEN i % 4 = 0 THEN 'Note ' || i END,
  CASE WHEN i % 2 = 0 THEN '/uploads/products/p' || i || '.jpg' END,
  20 + (i % 2), CASE WHEN i % 17 = 0 THEN 3 ELSE NULL END,
  i % 11 = 0, CASE WHEN i % 11 = 0 THEN 50 END,
  CASE WHEN i % 13 = 0 THEN (i/13) % 200 END, CASE WHEN i % 13 = 0 THEN (i/13) / 200 END,
  '{"region": "ocr"}', '{region}',
  timestamp '2026-01-01' + ((i % 5) * interval '1 hour') + ((i/5 % 3) * interval '1 day'),
  timestamp '2026-02-01' + (i * interval '1 minute')
FROM generate_series(0, :N - 1) i;
INSERT INTO "tasting_notes" ("id", "userId", "itemId", "rating", "updatedAt")
SELECT 't' || i, 'u1', 'b' || (i * 4), 4, now() FROM generate_series(0, :N / 4 - 1) i;
INSERT INTO "audit_logs" ("userId", "bottleId", "action", "status", "ip", "details")
SELECT 'u1', 'b' || i, 'UPDATE', 'success', '127.0.0.1', NULL FROM generate_series(0, :N - 1) i;
INSERT INTO "collections" ("id", "name", "userId", "updatedAt") VALUES ('e1', 'Gifts', 'u1', now());
INSERT INTO "_CollectionItems" ("A", "B") SELECT 'e1', 'b' || i FROM generate_series(0, :N - 1, 7) i;

-- FEAT-93 migration bench: a synthetic instance of :N groups, each in a cell
-- of one cellar, at the schema the families migration leaves; groups 2k and
-- 2k+1 are identical (half of them fuse), with tastings and history, to keep
-- the slots migration's duration in check (check-slots-migration.sh
-- replaces :N, at most 10,000: one cell each in a 100 x 100 grid).
INSERT INTO "User" ("id", "username", "email", "passwordHash", "updatedAt") VALUES
  ('u1', 'alice', 'alice@example.test', 'x', now());
INSERT INTO "cellars" ("id", "name", "userId", "columns", "rows", "updatedAt") VALUES
  ('c1', 'Garage', 'u1', 100, 100, now());
INSERT INTO "products" ("id", "userId", "category", "name", "producer", "vintage", "updatedAt")
SELECT 'p' || w, 'u1', (ARRAY['wine','wine','sparkling','spirit','cigar'])[1 + w % 5]::"BottleCategory",
  'Wine ' || w, 'Producer ' || (w / 10), 2000 + w % 20, now()
FROM generate_series(0, :N / 4) w;
INSERT INTO "bottles" ("id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "cigarsPerBox",
  "purchasePrice", "purchasedAt", "createdAt", "updatedAt")
SELECT 'b' || i, 'u1', 'p' || (i / 4), 'c1', 1 + i % 100, 1 + i / 100, 1 + i % 3,
  CASE WHEN (i / 4) % 5 = 4 THEN 25 END,
  20 + (i / 2) % 2, date '2026-01-01' + (i / 2) % 7,
  timestamp '2026-01-01' + (i * interval '1 minute'), timestamp '2026-02-01' + (i * interval '1 minute')
FROM generate_series(0, :N - 1) i;
INSERT INTO "tasting_notes" ("id", "userId", "itemId", "productId", "rating", "updatedAt")
SELECT 't' || i, 'u1', 'b' || (i * 4 + 1), 'p' || i, 4, now() FROM generate_series(0, :N / 4 - 1) i;
INSERT INTO "audit_logs" ("userId", "bottleId", "productId", "action", "status", "ip", "details")
SELECT 'u1', 'b' || i, 'p' || (i / 4), 'UPDATE', 'success', '127.0.0.1', NULL FROM generate_series(0, :N - 1) i;

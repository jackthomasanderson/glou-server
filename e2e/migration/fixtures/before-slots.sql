-- FEAT-93 migration bench: the cases of the slots migration, at the schema
-- the families migration leaves (one cell per unit: bottles.slotColumn and
-- slotRow). Loaded by check-slots-migration.sh after fixtures/before-families.sql
-- has been through the families migration (users a1/a2, cellars c1/c2), then
-- checked by checks/30-slots-transform.sql once the slots migration has run.
-- Ids: '00000000-0000-4000-8000-' then 12 hex digits; this file uses 8xx.
--
-- Columns without a database default (Prisma's uuid() and @updatedAt) are
-- written explicitly.

INSERT INTO "cellars" ("id", "name", "userId", "columns", "rows", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000008c3', 'Cellar', '00000000-0000-4000-8000-0000000000a1', 10, 10, now());

INSERT INTO "products" ("id", "userId", "category", "name", "producer", "vintage", "format", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000f81', '00000000-0000-4000-8000-0000000000a1', 'wine', 'Pomerol', 'Château Nenin', 2016, NULL, now()),
  ('00000000-0000-4000-8000-000000000f82', '00000000-0000-4000-8000-0000000000a1', 'cigar', 'Robusto', 'Partagás', NULL, 'Robusto', now()),
  ('00000000-0000-4000-8000-000000000f83', '00000000-0000-4000-8000-0000000000a1', 'cigar', 'Lusitania', 'Partagás', NULL, 'Gran Corona', now()),
  ('00000000-0000-4000-8000-000000000f84', '00000000-0000-4000-8000-0000000000a1', 'wine', 'Sancerre', 'Vacheron', 2021, NULL, now()),
  ('00000000-0000-4000-8000-000000000f85', '00000000-0000-4000-8000-0000000000a1', 'wine', 'Vouvray', 'Huet', 2018, NULL, now()),
  ('00000000-0000-4000-8000-000000000f86', '00000000-0000-4000-8000-0000000000a1', 'spirit', 'Armagnac', 'Darroze', NULL, NULL, now());

-- Criterion 5: 811 (x2) and 812 (x1), identical and each in a cell, and 813
-- (x3, unplaced) become one group x6 (811 survives) holding both cells.
-- 814, opened, is a sub-record of 812 in a cell of its own: it keeps its
-- cell and now points at 811. A tasting, a history line and a wishlist link
-- follow their group to 811.
INSERT INTO "bottles" (
  "id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "purchasePrice", "purchasedAt",
  "isOpened", "fillLevel", "parentItemId", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f81',
   '00000000-0000-4000-8000-0000000008c3', 1, 1, 2, 30.00, '2026-03-01', false, NULL, NULL, '2026-03-01 10:00:00', '2026-03-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f81',
   '00000000-0000-4000-8000-0000000008c3', 2, 1, 1, 30.00, '2026-03-01', false, NULL, NULL, '2026-03-01 10:10:00', '2026-03-01 10:10:00'),
  ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f81',
   '00000000-0000-4000-8000-0000000008c3', NULL, NULL, 3, 30.00, '2026-03-01', false, NULL, NULL, '2026-03-01 10:20:00', '2026-03-01 10:20:00'),
  ('00000000-0000-4000-8000-000000000814', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f81',
   '00000000-0000-4000-8000-0000000008c3', 3, 1, 1, 30.00, '2026-03-01', true, 40, '00000000-0000-4000-8000-000000000812',
   '2026-03-01 10:30:00', '2026-04-01 20:00:00');

INSERT INTO "tasting_notes" ("id", "userId", "itemId", "productId", "rating", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000008d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000812',
   '00000000-0000-4000-8000-000000000f81', 4, now());
INSERT INTO "audit_logs" ("userId", "bottleId", "productId", "action", "status", "ip", "details") VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000f81',
   'UPDATE', 'success', '127.0.0.1', '{"changes": [{"field": "slotColumn", "from": null, "to": 2}]}');
INSERT INTO "wishlist_items" ("id", "userId", "name", "producer", "category", "status", "acquiredItemId", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000000a1', 'Pomerol', 'Château Nenin',
   'wine', 'acquired', '00000000-0000-4000-8000-000000000813', now());

-- Single cigars take one cell for the group: 821 (x5) and 822 (x3) each hold
-- one and stay apart; 823 (x2, unplaced) joins 821. Closed boxes each have
-- their cell: 831 (1 box) and 832 (2 boxes) fuse, 3 boxes in 2 cells.
INSERT INTO "bottles" (
  "id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "cigarsPerBox", "purchasePrice",
  "purchasedAt", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f82',
   '00000000-0000-4000-8000-0000000008c3', 1, 2, 5, NULL, 12.00, '2026-05-01', '2026-05-01 10:00:00', '2026-05-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f82',
   '00000000-0000-4000-8000-0000000008c3', 2, 2, 3, NULL, 12.00, '2026-05-01', '2026-05-01 10:10:00', '2026-05-01 10:10:00'),
  ('00000000-0000-4000-8000-000000000823', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f82',
   '00000000-0000-4000-8000-0000000008c3', NULL, NULL, 2, NULL, 12.00, '2026-05-01', '2026-05-01 10:20:00', '2026-05-01 10:20:00'),
  ('00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f83',
   '00000000-0000-4000-8000-0000000008c3', 1, 3, 1, 25, 300.00, '2026-05-02', '2026-05-02 10:00:00', '2026-05-02 10:00:00'),
  ('00000000-0000-4000-8000-000000000832', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f83',
   '00000000-0000-4000-8000-0000000008c3', 2, 3, 2, 25, 300.00, '2026-05-02', '2026-05-02 10:10:00', '2026-05-02 10:10:00');

-- #174: 841, in the trash, kept its cell (1, 4), since given to 842: its
-- slot is copied in the trash with it, 842's is live. Left behind and
-- counted: 851's cell without a cellar (#579), 852's half-filled one, 853's
-- on a finished bottle and 854's outside the grid's range.
INSERT INTO "bottles" (
  "id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "purchasePrice", "purchasedAt",
  "isOpened", "fillLevel", "deletedAt", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000841', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   '00000000-0000-4000-8000-0000000008c3', 1, 4, 1, 18.00, '2026-06-01', false, NULL, '2026-09-01 10:00:00',
   '2026-06-01 10:00:00', '2026-09-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000842', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   '00000000-0000-4000-8000-0000000008c3', 1, 4, 1, 19.00, '2026-06-01', false, NULL, NULL,
   '2026-06-01 11:00:00', '2026-06-01 11:00:00'),
  ('00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   NULL, 3, 3, 1, 20.00, '2026-06-02', false, NULL, NULL, '2026-06-02 10:00:00', '2026-06-02 10:00:00'),
  ('00000000-0000-4000-8000-000000000852', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   '00000000-0000-4000-8000-0000000008c3', 4, NULL, 1, 21.00, '2026-06-03', false, NULL, NULL, '2026-06-03 10:00:00', '2026-06-03 10:00:00'),
  ('00000000-0000-4000-8000-000000000853', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   '00000000-0000-4000-8000-0000000008c3', 5, 5, 1, 22.00, '2026-06-04', true, 0, NULL, '2026-06-04 10:00:00', '2026-06-04 10:00:00'),
  ('00000000-0000-4000-8000-000000000854', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f84',
   '00000000-0000-4000-8000-0000000008c3', 0, 6, 1, 23.00, '2026-06-05', false, NULL, NULL, '2026-06-05 10:00:00', '2026-06-05 10:00:00');

-- 861 and 862, identical and each in a cell, were counted in the same
-- inventory session: they stay apart (one entry per unit and session). 863,
-- identical and unplaced, joins 861, whose entry then says it found 1.
INSERT INTO "bottles" (
  "id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "purchasePrice", "purchasedAt",
  "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000861', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f85',
   '00000000-0000-4000-8000-0000000008c3', 1, 6, 1, 25.00, '2026-07-01', '2026-07-01 10:00:00', '2026-07-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000862', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f85',
   '00000000-0000-4000-8000-0000000008c3', 2, 6, 1, 25.00, '2026-07-01', '2026-07-01 10:10:00', '2026-07-01 10:10:00'),
  ('00000000-0000-4000-8000-000000000863', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f85',
   '00000000-0000-4000-8000-0000000008c3', NULL, NULL, 1, 25.00, '2026-07-01', '2026-07-01 10:20:00', '2026-07-01 10:20:00');

INSERT INTO "inventory_count_sessions" ("id", "scopeLabel", "cellarId", "status", "userId", "completedAt") VALUES
  ('00000000-0000-4000-8000-0000000008f1', 'Cellar, summer', '00000000-0000-4000-8000-0000000008c3', 'completed',
   '00000000-0000-4000-8000-0000000000a1', '2026-07-10 10:00:00');
INSERT INTO "inventory_count_entries" ("id", "sessionId", "itemId", "status") VALUES
  ('00000000-0000-4000-8000-0000000008f2', '00000000-0000-4000-8000-0000000008f1', '00000000-0000-4000-8000-000000000861', 'confirmed'),
  ('00000000-0000-4000-8000-0000000008f3', '00000000-0000-4000-8000-0000000008f1', '00000000-0000-4000-8000-000000000862', 'confirmed');

-- A spirit group x2 in a cell, to check the guard after the migration: its
-- count cannot fall below its cells, and it gives its cell back when its
-- cellar is deleted.
INSERT INTO "bottles" (
  "id", "userId", "productId", "cellarId", "slotColumn", "slotRow", "quantity", "purchasePrice", "purchasedAt",
  "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000871', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000f86',
   '00000000-0000-4000-8000-0000000008c3', 1, 7, 2, 60.00, '2026-08-01', '2026-08-01 10:00:00', '2026-08-01 10:00:00');

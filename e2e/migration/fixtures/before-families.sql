-- #471 migration bench: a small instance at the schema just before the
-- families migrations (bottles = one record per unit). Loaded by
-- check-families-migration.sh, then checked by checks/*.sql once the real
-- migrations have run (expand, then transform). Ids are fixed so the checks
-- can name each case: '00000000-0000-4000-8000-' then 12 hex digits.
--
-- Columns without a database default (Prisma's uuid() and @updatedAt are
-- filled by the client) are written explicitly.

INSERT INTO "User" ("id", "username", "email", "passwordHash", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'alice', 'alice@example.test', 'not-a-password-hash', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'bob', 'bob@example.test', 'not-a-password-hash', now());

INSERT INTO "cellars" ("id", "name", "userId", "columns", "rows", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'Garage', '00000000-0000-4000-8000-0000000000a1', 6, 4, now()),
  ('00000000-0000-4000-8000-0000000000c2', 'Humidor', '00000000-0000-4000-8000-0000000000a2', NULL, NULL, now());

-- b1: a full wine with every family-level field set, a slot, locks and
-- sources on both sides; created at 23:30 UTC in winter = next day in Paris.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "slotColumn", "slotRow", "category", "name", "producer", "location",
  "collection", "tags", "photoUrl", "notes", "purchasePrice", "purchasePlace", "estimatedValue",
  "vintage", "color", "region", "grapeVarieties", "alcoholDegree", "bottleSize", "needsAeration",
  "serviceTemp", "appellation", "classification", "peakMaturityFrom", "peakMaturityTo", "curveShape",
  "alertsPaused", "consumptionPostponedUntil", "reminderDate", "alertStatus", "updatedBy",
  "lockedFields", "fieldSources", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', 1, 1, 'wine', 'Talbot', 'Château Talbot', 'Rack A',
  'Old label', '{gift,bordeaux}', '/uploads/products/talbot.jpg', 'From Paul', 20.00, 'Wine shop', 35.50,
  2015, 'red', 'Bordeaux', '{Merlot,"Cabernet Sauvignon"}', 13.5, '75cl', true,
  '16-18 °C', 'Saint-Julien', '4e Grand Cru Classé', 2025, 2035, 'BELL',
  true, '2026-12-01 00:00:00', '2027-03-01 00:00:00', 'peak', '00000000-0000-4000-8000-0000000000a2',
  '{name,purchasePrice,region}', '{"name": "ocr", "purchasePrice": "import_csv", "vintage": "ocr"}',
  '2026-01-14 23:30:00', '2026-02-01 10:00:00'
);

-- b2: a finished wine that still carries the old "Increment" count, created
-- at 22:30 UTC in summer = next day in Paris.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "vintage", "quantity", "isOpened",
  "fillLevel", "openedAt", "purchasePrice", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', 'wine', 'Talbot', 'Château Talbot', 2015, 6, true,
  0, '2026-08-01 19:00:00', 20.00, '2026-07-01 22:30:00', '2026-08-01 19:00:00'
);

-- b3: sparkling, created at 21:30 UTC in summer = same day in Paris.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "sparklingType", "sugarLevel",
  "disgorgingDate", "baseYear", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000c1', 'sparkling', 'Grande Cuvée', 'Krug', 'champagne', 'brut',
  '2024-03-01 00:00:00', 2012, '2026-07-01 21:30:00', '2026-07-01 21:30:00'
);

-- b4: a spirit in the trash, with the cask/batch technical sheet and a JSON
-- null as field sources.
INSERT INTO "bottles" (
  "id", "userId", "category", "name", "producer", "alcoholDegree", "spiritType", "edition",
  "declaredAge", "caskType", "additions", "aromaticProfile", "lotNumber", "batchDate",
  "isSingleCask", "caskNumber", "caskProof", "fieldSources", "deletedAt", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a1', 'spirit',
  'Lagavulin 16', 'Lagavulin', 43, 'whisky', 'Distillers Edition', 16, 'Sherry', 'None',
  'Peat, smoke', 'L123', '2019-05-01 00:00:00', true, '4512', 56.1, 'null',
  '2026-10-25 08:00:00', '2025-12-24 12:00:00', '2026-10-25 08:00:00'
);

-- b5: an opened cigar box (quantity = cigars left), in the humidor.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "format", "quantity", "isOpened",
  "manufactureYear", "leafOrigin", "factoryCode", "recommendedHumidity", "humidificationSystem",
  "purchasePrice", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000c2', 'cigar', 'Siglo VI', 'Cohiba', 'Cañonazo', 25, true,
  2021, 'Cuba', 'EMS', 69, 'Boveda', 450.00, '2026-03-10 09:00:00', '2026-03-10 09:00:00'
);

-- b6: a FEAT-87 non-owned reference.
INSERT INTO "bottles" (
  "id", "userId", "category", "name", "producer", "vintage", "isOwned", "createdAt", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000a2', 'wine',
  'Clos Rougeard', 'Foucault', 2017, false, '2026-04-02 10:00:00', '2026-04-02 10:00:00'
);

INSERT INTO "tasting_notes" ("id", "userId", "itemId", "rating", "notes", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 4, 'Cedar', now()),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b6', 5, 'At a friend''s', now()),
  -- Already orphaned: its bottle was purged.
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', NULL, 3, NULL, now());

INSERT INTO "audit_logs" ("userId", "bottleId", "action", "status", "ip", "details") VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'UPDATE', 'success', '127.0.0.1',
   '{"changes": [{"field": "region", "from": null, "to": "Bordeaux"}]}'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'CREATE', 'success', '127.0.0.1', NULL),
  ('00000000-0000-4000-8000-0000000000a1', NULL, 'LOGIN', 'success', '127.0.0.1', NULL);

INSERT INTO "collections" ("id", "name", "userId", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'Gifts', '00000000-0000-4000-8000-0000000000a1', now()),
  ('00000000-0000-4000-8000-0000000000e2', 'Keep', '00000000-0000-4000-8000-0000000000a2', now());

INSERT INTO "_CollectionItems" ("A", "B") VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b1');

INSERT INTO "inventory_count_sessions" ("id", "scopeLabel", "cellarId", "status", "userId") VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'Garage', '00000000-0000-4000-8000-0000000000c1', 'active',
   '00000000-0000-4000-8000-0000000000a1');

INSERT INTO "inventory_count_entries" ("id", "sessionId", "itemId", "status") VALUES
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1',
   '00000000-0000-4000-8000-0000000000b1', 'confirmed');

INSERT INTO "wishlist_items" ("id", "userId", "name", "producer", "category", "status", "acquiredItemId", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000a2', 'Grande Cuvée', 'Krug',
   'sparkling', 'acquired', '00000000-0000-4000-8000-0000000000b3', now());

-- ===========================================================================
-- The transform step (FEAT-94): one case per acceptance criterion and the
-- edge cases of decisions D2-D5, D26 and QP6. Ids end with the case number.
-- Unless said otherwise: owned, in the garage, created on the same Paris day.
-- ===========================================================================

-- Criterion 1: six full records of one wine, same cellar, price and day, no
-- slot, become one group x6 (101 survives). Their family fields merge (D3).
-- Bottle sizes and places differ only by case and spaces, or are empty.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "vintage", "bottleSize", "purchasePrice",
  "purchasePlace", "quantity", "region", "color", "notes", "photoUrl", "tags", "lockedFields", "fieldSources",
  "alertsPaused", "consumptionPostponedUntil", "reminderDate", "peakMaturityFrom", "peakMaturityTo",
  "curveShape", "updatedBy", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Margaux', 'Château Margaux', 2010, '75cl', 300.00, 'Wine shop', NULL, 'Margaux', NULL,
   'Bought at the fair', NULL, '{fair}', '{region}', '{"region": "ocr"}',
   true, '2026-12-01 00:00:00', NULL, 2020, 2030, 'BELL', NULL, '2026-05-10 08:00:00', '2026-05-10 08:00:00'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'margaux ', ' château margaux', 2010, ' 75CL', 300.00, NULL, 1, NULL, 'red',
   NULL, '/uploads/products/margaux-old.jpg', '{}', '{color}', '{"region": "manual", "color": "ocr"}',
   false, NULL, NULL, NULL, NULL, NULL, '00000000-0000-4000-8000-0000000000a1', '2026-05-10 09:00:00', '2026-06-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Margaux', 'Château Margaux', 2010, '75cl', 300.00, 'wine shop ', NULL, NULL, NULL,
   NULL, NULL, '{}', '{}', NULL,
   true, '2027-02-01 00:00:00', '2027-06-01 00:00:00', NULL, NULL, NULL, NULL, '2026-05-10 10:00:00', '2026-05-10 10:00:00'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Margaux', 'Château Margaux', 2010, '75cl', 300.00, NULL, NULL, NULL, NULL,
   'For Paul''s wedding', NULL, '{}', '{}', NULL,
   true, '2027-01-15 00:00:00', '2027-01-01 00:00:00', NULL, NULL, NULL, NULL, '2026-05-10 11:00:00', '2026-05-10 11:00:00'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Margaux', 'Château Margaux', 2010, '75cl', 300.00, NULL, NULL, NULL, NULL,
   'Bought at the fair', '/uploads/products/margaux-new.jpg', '{}', '{}', NULL,
   true, '2027-01-15 00:00:00', NULL, NULL, NULL, 'PLATEAU', '00000000-0000-4000-8000-0000000000a2', '2026-05-10 12:00:00', '2026-09-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Margaux', 'Château Margaux', 2010, '75cl', 300.00, NULL, NULL, NULL, NULL,
   NULL, NULL, '{gift,fair}', '{}', NULL,
   true, '2027-01-15 00:00:00', NULL, NULL, NULL, NULL, NULL, '2026-05-10 13:00:00', '2026-05-10 13:00:00');

-- Criterion 2 and D2: region "Haut-Médoc" and an empty region share a family
-- (201, 202); "Bordeaux" and "Saint-Julien" stay apart (203, 204), and 210,
-- in the trash and created first, joins 203 because trashed records come last.
-- Non-transitive chains: X, empty, Y gives {X, empty} and {Y} (205-207), and
-- so does empty, X, Y (208-20a). Case, spaces and grape order do not matter
-- (20b joins b1); other grapes do (20d). An empty vintage is a vintage of its
-- own (20e joins b3, 20f does not; D26). A different drinking window is a
-- disagreement (213, 214).
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "vintage", "region", "grapeVarieties",
  "peakMaturityFrom", "deletedAt", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Sociando-Mallet', 'Château Sociando-Mallet', 2016, 'Haut-Médoc', '{}', NULL, NULL, '2026-02-01 10:00:00', '2026-02-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Sociando-Mallet', 'Château Sociando-Mallet', 2016, NULL, '{}', NULL, NULL, '2026-02-02 10:00:00', '2026-02-02 10:00:00'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Gruaud Larose', 'Château Gruaud Larose', 2015, 'Bordeaux', '{}', NULL, NULL, '2026-03-01 10:00:00', '2026-03-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Gruaud Larose', 'Château Gruaud Larose', 2015, 'Saint-Julien', '{}', NULL, NULL, '2026-03-02 10:00:00', '2026-03-02 10:00:00'),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Gruaud Larose', 'Château Gruaud Larose', 2015, NULL, '{}', NULL, '2026-09-01 10:00:00', '2026-01-01 10:00:00', '2026-09-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Clos de Vougeot', 'Domaine Leroy', 2018, 'Bourgogne', '{}', NULL, NULL, '2026-04-01 10:00:00', '2026-04-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Clos de Vougeot', 'Domaine Leroy', 2018, NULL, '{}', NULL, NULL, '2026-04-02 10:00:00', '2026-04-02 10:00:00'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Clos de Vougeot', 'Domaine Leroy', 2018, 'Rhône', '{}', NULL, NULL, '2026-04-03 10:00:00', '2026-04-03 10:00:00'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Hermitage', 'Jean-Louis Chave', 2017, '', '{}', NULL, NULL, '2026-04-01 10:00:00', '2026-04-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Hermitage', 'Jean-Louis Chave', 2017, 'Rhône', '{}', NULL, NULL, '2026-04-02 10:00:00', '2026-04-02 10:00:00'),
  ('00000000-0000-4000-8000-00000000020a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Hermitage', 'Jean-Louis Chave', 2017, 'Bourgogne', '{}', NULL, NULL, '2026-04-03 10:00:00', '2026-04-03 10:00:00'),
  ('00000000-0000-4000-8000-00000000020b', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'TALBOT ', ' château talbot', 2015, ' bordeaux', '{"cabernet sauvignon"," MERLOT"}', NULL, NULL, '2026-08-01 10:00:00', '2026-08-01 10:00:00'),
  ('00000000-0000-4000-8000-00000000020d', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Talbot', 'Château Talbot', 2015, NULL, '{Syrah}', NULL, NULL, '2026-08-02 10:00:00', '2026-08-02 10:00:00'),
  ('00000000-0000-4000-8000-00000000020e', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1',
   'sparkling', 'Grande Cuvée', 'Krug', NULL, NULL, '{}', NULL, NULL, '2026-08-03 10:00:00', '2026-08-03 10:00:00'),
  ('00000000-0000-4000-8000-00000000020f', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1',
   'sparkling', 'Grande Cuvée', 'Krug', 2008, NULL, '{}', NULL, NULL, '2026-08-04 10:00:00', '2026-08-04 10:00:00'),
  ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Cos d''Estournel', 'Château Cos d''Estournel', 2010, NULL, '{}', 2020, NULL, '2026-04-05 10:00:00', '2026-04-05 10:00:00'),
  ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Cos d''Estournel', 'Château Cos d''Estournel', 2010, NULL, '{}', 2025, NULL, '2026-04-06 10:00:00', '2026-04-06 10:00:00');

-- Criterion 3 and D4: b2 (finished x6) above; 301, an opened spirit x3 in a
-- slot with a tasting, keeps all of it as x1 next to a guessed group x2 (and
-- b4, in the trash, joins its family); 302, finished x2 in the trash, splits
-- in the trash; 303, opened with no level, x4. 304: closed but not full (a
-- level without opening), x1: a sub-record with nothing to split.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "slotColumn", "slotRow", "category", "name", "producer", "vintage", "quantity",
  "isOpened", "fillLevel", "openedAt", "purchasePrice", "estimatedValue", "purchasePlace", "deletedAt", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 2, 1,
   'spirit', 'Lagavulin 16', 'Lagavulin', NULL, 3, true, 50, '2026-06-01 20:00:00', 80.00, 95.00, 'Distillery',
   NULL, '2026-05-20 10:00:00', '2026-06-01 20:00:00'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chinon', 'Bernard Baudry', 2019, 2, true, 0, '2026-06-02 20:00:00', 15.00, NULL, NULL,
   '2026-09-10 10:00:00', '2026-05-21 10:00:00', '2026-09-10 10:00:00'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Bandol', 'Domaine Tempier', 2018, 4, true, NULL, NULL, 30.00, NULL, NULL,
   NULL, '2026-05-22 10:00:00', '2026-05-22 10:00:00'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Bandol', 'Domaine Tempier', 2018, 1, false, 60, NULL, 30.00, NULL, NULL,
   NULL, '2026-05-23 10:00:00', '2026-05-23 10:00:00');

-- Criterion 4: FEAT-87 references. 401 has the key of the Margaux family and
-- joins it with its tasting (its inventory entry and wishlist link have no
-- unit left); 402, in the trash, is a family of its own, left in the trash.
INSERT INTO "bottles" (
  "id", "userId", "category", "name", "producer", "vintage", "isOwned", "deletedAt", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a2', 'wine', 'Margaux', 'Château Margaux',
   2010, false, NULL, '2026-07-01 10:00:00', '2026-07-01 10:00:00'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000a2', 'wine', 'Musigny', 'Comte de Vogüé',
   2012, false, '2026-09-20 10:00:00', '2026-07-02 10:00:00', '2026-09-20 10:00:00');

-- Cigars (rule 3): b5 above (opened, 25 left). 501 and 502, closed boxes of 25
-- of the same cigar, fuse into 2 boxes of b5's family; 503, a closed box with
-- no cigar left in a slot, becomes a finished box and frees it; 504, no
-- count, is a box of 1; 505, another vitola, another family; 506 and 507,
-- empty vitola written two ways, one family apart from 508; 509, a finished
-- box of 10.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "slotColumn", "slotRow", "category", "name", "producer", "format", "quantity",
  "isOpened", "fillLevel", "purchasePrice", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Siglo VI', 'Cohiba', 'Cañonazo', 25, false, NULL, 450.00, '2026-04-10 09:00:00', '2026-04-10 09:00:00'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Siglo VI', 'Cohiba', 'cañonazo', 25, false, NULL, 450.00, '2026-04-10 10:00:00', '2026-04-10 10:00:00'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', 3, 1,
   'cigar', 'Siglo VI', 'Cohiba', 'Cañonazo', 0, false, NULL, 450.00, '2026-04-11 10:00:00', '2026-04-12 10:00:00'),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'No. 2', 'Montecristo', 'Torpedo', NULL, false, NULL, 12.00, '2026-04-12 10:00:00', '2026-04-12 10:00:00'),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Siglo VI', 'Cohiba', 'Robusto', 10, false, NULL, 200.00, '2026-04-13 10:00:00', '2026-04-13 10:00:00'),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Behike', 'Cohiba', NULL, 10, false, NULL, 600.00, '2026-04-14 10:00:00', '2026-04-14 10:00:00'),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Behike', 'Cohiba', ' ', 3, true, NULL, 600.00, '2026-04-15 10:00:00', '2026-04-15 10:00:00'),
  ('00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Behike', 'Cohiba', 'BHK 52', 10, false, NULL, 700.00, '2026-04-16 10:00:00', '2026-04-16 10:00:00'),
  ('00000000-0000-4000-8000-000000000509', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', NULL, NULL,
   'cigar', 'Behike', 'Cohiba', 'BHK 52', 10, true, 0, 700.00, '2026-04-17 10:00:00', '2026-04-17 10:00:00');

-- Rule 4 exceptions and the D5 guard, on one wine and one day: 601 and 602 are
-- counted in the same inventory session and stay apart; 603 joins 601; 606
-- (place "Fair") joins 601 (no place); 607 (place "Shop") then disagrees with
-- 601's group and joins 602's; 604 and 605 hold a slot each and stay alone; 608
-- (another estimated value) and 609 (another price) are other groups.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "slotColumn", "slotRow", "category", "name", "producer", "vintage", "purchasePrice",
  "estimatedValue", "purchasePlace", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, NULL, '2026-06-15 06:00:00', '2026-06-15 06:00:00'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, NULL, '2026-06-15 07:00:00', '2026-06-15 07:00:00'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, NULL, '2026-06-15 08:00:00', '2026-06-15 08:00:00'),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 4, 1,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, NULL, '2026-06-15 08:10:00', '2026-06-15 08:10:00'),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 5, 1,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, NULL, '2026-06-15 08:20:00', '2026-06-15 08:20:00'),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, 'Fair', '2026-06-15 09:00:00', '2026-06-15 09:00:00'),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, NULL, 'Shop', '2026-06-15 10:00:00', '2026-06-15 10:00:00'),
  ('00000000-0000-4000-8000-000000000608', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 25.00, 30.00, NULL, '2026-06-15 11:00:00', '2026-06-15 11:00:00'),
  ('00000000-0000-4000-8000-000000000609', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', NULL, NULL,
   'wine', 'Chablis', 'William Fèvre', 2020, 26.00, NULL, NULL, '2026-06-15 12:00:00', '2026-06-15 12:00:00');

-- Counts (rule 3): an empty count is 1 (b1, 101...), and so are 0 (701) and a
-- negative count (702); 703 kept the old "Increment" count, which now counts.
INSERT INTO "bottles" (
  "id", "userId", "cellarId", "category", "name", "producer", "vintage", "quantity", "purchasePrice", "createdAt", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Muscadet', 'Domaine de l''Écu', 2022, 0, 10.00, '2026-03-20 10:00:00', '2026-03-20 10:00:00'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Muscadet', 'Domaine de l''Écu', 2022, -2, 10.00, '2026-03-21 10:00:00', '2026-03-21 10:00:00'),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'wine', 'Saumur-Champigny', 'Clos Rougeard', 2019, 4, 40.00, '2026-03-22 10:00:00', '2026-03-22 10:00:00');

INSERT INTO "tasting_notes" ("id", "userId", "itemId", "rating", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000401', 4, now()),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000301', 4, now()),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 5, now());

INSERT INTO "audit_logs" ("userId", "bottleId", "action", "status", "ip", "details") VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'UPDATE', 'success', '127.0.0.1',
   '{"changes": [{"field": "photoUrl", "from": null, "to": "/uploads/products/margaux-new.jpg"}]}'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000401', 'CREATE', 'success', '127.0.0.1', NULL);

INSERT INTO "_CollectionItems" ("A", "B") VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000106'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000603');

INSERT INTO "inventory_count_sessions" ("id", "scopeLabel", "cellarId", "status", "userId", "completedAt") VALUES
  ('00000000-0000-4000-8000-0000000000f3', 'Garage, spring', '00000000-0000-4000-8000-0000000000c1', 'completed',
   '00000000-0000-4000-8000-0000000000a1', '2026-06-20 10:00:00');

INSERT INTO "inventory_count_entries" ("id", "sessionId", "itemId", "status") VALUES
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000601', 'confirmed'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000602', 'confirmed'),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000106', 'confirmed'),
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000401', 'confirmed');

INSERT INTO "wishlist_items" ("id", "userId", "name", "producer", "category", "status", "acquiredItemId", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000a1', 'Margaux', 'Château Margaux',
   'wine', 'acquired', '00000000-0000-4000-8000-000000000103', now()),
  ('00000000-0000-4000-8000-0000000000ad', '00000000-0000-4000-8000-0000000000a2', 'Margaux', 'Château Margaux',
   'wine', 'acquired', '00000000-0000-4000-8000-000000000401', now());

-- QP6: a preset writing a state (opened, level or opening date, even empty)
-- is deleted; the others stay.
INSERT INTO "bulk_presets" ("id", "name", "payload", "userId", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000ba1', 'To the garage', '{"cellarId": "00000000-0000-4000-8000-0000000000c1"}', '00000000-0000-4000-8000-0000000000a1', now()),
  ('00000000-0000-4000-8000-000000000ba2', 'Opened', '{"isOpened": true}', '00000000-0000-4000-8000-0000000000a1', now()),
  ('00000000-0000-4000-8000-000000000ba3', 'Half, tagged', '{"fillLevel": 50, "tags": ["half"]}', '00000000-0000-4000-8000-0000000000a1', now()),
  ('00000000-0000-4000-8000-000000000ba4', 'No opening date', '{"openedAt": null}', '00000000-0000-4000-8000-0000000000a2', now()),
  ('00000000-0000-4000-8000-000000000ba5', 'Tag it', '{"tags": ["party"]}', '00000000-0000-4000-8000-0000000000a2', now());

-- #471 migration bench: a small instance at the schema just before the
-- families migrations (bottles = one record per unit). Loaded by
-- check-families-migration.sh, then checked by checks/*.sql once the real
-- migrations have run. Ids are fixed so the checks can name each case.
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

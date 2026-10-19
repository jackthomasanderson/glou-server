-- #102: InventoryItem.syncedAt was reserved for a third-party sync/enrichment
-- pipeline that was never built (#74) and never read or written anywhere in
-- the codebase. Dropped rather than kept as unused protective machinery.
ALTER TABLE "InventoryItem" DROP COLUMN "syncedAt";

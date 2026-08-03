-- FEAT-12 spec/code gap-fix: feature.md promises three corrective actions at
-- session closure ("déclarer consommé", "déplacer vers cette zone",
-- "ajouter au stock") but the model only ever allowed the first two —
-- `itemId` was NOT NULL, making it structurally impossible to record a
-- count entry for a physical item that matches nothing in the system yet
-- (which is exactly the "ajouter au stock" case, by definition). See
-- inventory-count.service.ts#recordUnlistedFind / #applyCorrectionsInternal
-- (action 'add_to_stock').

ALTER TABLE "inventory_count_entries" ALTER COLUMN "itemId" DROP NOT NULL;

ALTER TABLE "inventory_count_entries" ADD COLUMN "newItemName" TEXT;
ALTER TABLE "inventory_count_entries" ADD COLUMN "newItemCategory" "BottleCategory";
ALTER TABLE "inventory_count_entries" ADD COLUMN "newItemQuantity" INTEGER;

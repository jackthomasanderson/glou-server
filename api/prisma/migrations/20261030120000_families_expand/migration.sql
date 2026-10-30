-- #471 (FEAT-92/94), expand step of the families model: adds the family
-- (`products`), "C'est un autre vin" pairs and the new unit columns, then
-- gives every existing row of `bottles` its own family, one to one, with the
-- same id (products.id = bottles.id). Nothing is grouped here: grouping
-- identical records is the transform step (FEAT-94), written separately.
-- The description columns stay on `bottles` as a transitional mirror, so
-- every existing reader keeps working unchanged.
--
-- Forward only (design.md "Sauvegarde & Migration"): going back means
-- restoring the backup taken before the update. One transaction, explicit:
-- applied entirely or not at all.

BEGIN;

-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "cigarsLeft" INTEGER,
ADD COLUMN     "cigarsPerBox" INTEGER,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentItemId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "purchasedAt" DATE,
ADD COLUMN     "writtenOffAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "tasting_notes" ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "inventory_count_entries" ADD COLUMN     "foundQuantity" INTEGER;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "BottleCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "collection" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrl" TEXT,
    "otherPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "vintage" INTEGER,
    "color" TEXT,
    "region" TEXT,
    "grapeVarieties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alcoholDegree" DOUBLE PRECISION,
    "needsAeration" BOOLEAN,
    "serviceTemp" TEXT,
    "lotNumber" TEXT,
    "batchDate" TIMESTAMP(3),
    "appellation" TEXT,
    "classification" TEXT,
    "sparklingType" TEXT,
    "sugarLevel" TEXT,
    "disgorgingDate" TIMESTAMP(3),
    "baseYear" INTEGER,
    "spiritType" TEXT,
    "edition" TEXT,
    "declaredAge" INTEGER,
    "caskType" TEXT,
    "additions" TEXT,
    "aromaticProfile" TEXT,
    "isSingleCask" BOOLEAN,
    "caskNumber" TEXT,
    "caskProof" DOUBLE PRECISION,
    "format" TEXT,
    "manufactureYear" INTEGER,
    "leafOrigin" TEXT,
    "factoryCode" TEXT,
    "recommendedHumidity" DOUBLE PRECISION,
    "humidificationSystem" TEXT,
    "peakMaturityFrom" INTEGER,
    "peakMaturityTo" INTEGER,
    "curveShape" "CurveShape",
    "alertsPaused" BOOLEAN NOT NULL DEFAULT false,
    "consumptionPostponedUntil" TIMESTAMP(3),
    "reminderDate" TIMESTAMP(3),
    "alertStatus" "AlertStatus",
    "updatedBy" TEXT,
    "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fieldSources" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_distinctions" (
    "productId" TEXT NOT NULL,
    "otherProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_distinctions_pkey" PRIMARY KEY ("productId","otherProductId")
);

-- CreateTable
CREATE TABLE "_CollectionProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CollectionProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "products_userId_idx" ON "products"("userId");

-- CreateIndex
CREATE INDEX "products_deletedAt_idx" ON "products"("deletedAt");

-- CreateIndex
CREATE INDEX "products_category_deletedAt_idx" ON "products"("category", "deletedAt");

-- CreateIndex
CREATE INDEX "products_alertStatus_idx" ON "products"("alertStatus");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_producer_idx" ON "products"("producer");

-- CreateIndex
CREATE INDEX "products_vintage_idx" ON "products"("vintage");

-- CreateIndex
CREATE INDEX "product_distinctions_otherProductId_idx" ON "product_distinctions"("otherProductId");

-- CreateIndex
CREATE INDEX "_CollectionProducts_B_index" ON "_CollectionProducts"("B");

-- CreateIndex
CREATE INDEX "bottles_productId_idx" ON "bottles"("productId");

-- CreateIndex
CREATE INDEX "bottles_parentItemId_idx" ON "bottles"("parentItemId");

-- CreateIndex
CREATE INDEX "audit_logs_productId_idx" ON "audit_logs"("productId");

-- CreateIndex
CREATE INDEX "tasting_notes_productId_idx" ON "tasting_notes"("productId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_distinctions" ADD CONSTRAINT "product_distinctions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_distinctions" ADD CONSTRAINT "product_distinctions_otherProductId_fkey" FOREIGN KEY ("otherProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "bottles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionProducts" ADD CONSTRAINT "_CollectionProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionProducts" ADD CONSTRAINT "_CollectionProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- "C'est un autre vin": one row per pair, smallest id first. Byte order
-- (COLLATE "C"), so the rule does not depend on the server's locale.
ALTER TABLE "product_distinctions" ADD CONSTRAINT "product_distinctions_ordered_pair"
  CHECK ("productId" COLLATE "C" < "otherProductId" COLLATE "C");

-- One family per existing row, same id. Locks and field sources keep only the
-- family's own columns (the unit has no locks; its sources stay on `bottles`).
-- Not in the trash: trashing a whole family is a new action, and a family
-- whose units are all in the trash is already treated as trashed.
WITH product_fields(names) AS (
  SELECT ARRAY[
  'category', 'name', 'producer', 'collection', 'tags', 'photoUrl',
  'notes', 'vintage', 'color', 'region', 'grapeVarieties', 'alcoholDegree',
  'needsAeration', 'serviceTemp', 'lotNumber', 'batchDate', 'appellation', 'classification',
  'sparklingType', 'sugarLevel', 'disgorgingDate', 'baseYear', 'spiritType', 'edition',
  'declaredAge', 'caskType', 'additions', 'aromaticProfile', 'isSingleCask', 'caskNumber',
  'caskProof', 'format', 'manufactureYear', 'leafOrigin', 'factoryCode', 'recommendedHumidity',
  'humidificationSystem', 'peakMaturityFrom', 'peakMaturityTo', 'curveShape', 'alertsPaused', 'consumptionPostponedUntil',
  'reminderDate', 'alertStatus'
  ]::TEXT[]
)
INSERT INTO "products" (
  "id", "userId",
  "category", "name", "producer", "collection", "tags", "photoUrl",
  "notes", "vintage", "color", "region", "grapeVarieties", "alcoholDegree",
  "needsAeration", "serviceTemp", "lotNumber", "batchDate", "appellation", "classification",
  "sparklingType", "sugarLevel", "disgorgingDate", "baseYear", "spiritType", "edition",
  "declaredAge", "caskType", "additions", "aromaticProfile", "isSingleCask", "caskNumber",
  "caskProof", "format", "manufactureYear", "leafOrigin", "factoryCode", "recommendedHumidity",
  "humidificationSystem", "peakMaturityFrom", "peakMaturityTo", "curveShape", "alertsPaused", "consumptionPostponedUntil",
  "reminderDate", "alertStatus",
  "updatedBy", "lockedFields", "fieldSources", "createdAt", "updatedAt"
)
SELECT
  b."id", b."userId",
  b."category", b."name", b."producer", b."collection", b."tags", b."photoUrl",
  b."notes", b."vintage", b."color", b."region", b."grapeVarieties", b."alcoholDegree",
  b."needsAeration", b."serviceTemp", b."lotNumber", b."batchDate", b."appellation", b."classification",
  b."sparklingType", b."sugarLevel", b."disgorgingDate", b."baseYear", b."spiritType", b."edition",
  b."declaredAge", b."caskType", b."additions", b."aromaticProfile", b."isSingleCask", b."caskNumber",
  b."caskProof", b."format", b."manufactureYear", b."leafOrigin", b."factoryCode", b."recommendedHumidity",
  b."humidificationSystem", b."peakMaturityFrom", b."peakMaturityTo", b."curveShape", b."alertsPaused", b."consumptionPostponedUntil",
  b."reminderDate", b."alertStatus",
  b."updatedBy",
  ARRAY(
    SELECT f FROM unnest(b."lockedFields") WITH ORDINALITY AS t(f, n)
    WHERE f = ANY (pf.names) ORDER BY n
  ),
  CASE WHEN jsonb_typeof(b."fieldSources") = 'object' THEN
    (SELECT jsonb_object_agg(key, value) FROM jsonb_each(b."fieldSources") WHERE key = ANY (pf.names))
  END,
  b."createdAt", b."updatedAt"
FROM "bottles" b CROSS JOIN product_fields pf;

-- D6: the purchase day is the day the record was created, read in the images'
-- default time zone. `createdAt` is a UTC timestamp without zone; the zone is
-- written here on purpose (TZ=Europe/Paris in api/Dockerfile): an instance set
-- to another zone may see a purchase made near midnight one day off.
-- A plain UPDATE leaves "updatedAt" alone (no trigger), so a change queued
-- offline against a unit is not turned into a conflict by this migration.
UPDATE "bottles" SET
  "productId" = "id",
  "purchasedAt" = ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::DATE;

ALTER TABLE "bottles" ALTER COLUMN "productId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tastings and field history follow their unit to its family; an orphan
-- tasting or log line (unit purged) stays without a family.
UPDATE "tasting_notes" SET "productId" = "itemId" WHERE "itemId" IS NOT NULL;
UPDATE "audit_logs" SET "productId" = "bottleId" WHERE "bottleId" IS NOT NULL;

-- Collections now hold families. "_CollectionItems" stays (mirror).
INSERT INTO "_CollectionProducts" ("A", "B") SELECT "A", "B" FROM "_CollectionItems";

-- Invariants: any failure rolls the whole migration back.
DO $$
BEGIN
  IF (SELECT count(*) FROM "products") <> (SELECT count(*) FROM "bottles") THEN
    RAISE EXCEPTION 'families_expand: % families for % records',
      (SELECT count(*) FROM "products"), (SELECT count(*) FROM "bottles");
  END IF;
  IF EXISTS (SELECT 1 FROM "bottles" WHERE "productId" <> "id" OR "purchasedAt" IS NULL) THEN
    RAISE EXCEPTION 'families_expand: a record is not attached to its own family or has no purchase day';
  END IF;
  IF EXISTS (SELECT 1 FROM "tasting_notes" WHERE "productId" IS DISTINCT FROM "itemId") THEN
    RAISE EXCEPTION 'families_expand: a tasting is not on the family of its bottle';
  END IF;
  IF EXISTS (SELECT 1 FROM "audit_logs" WHERE "productId" IS DISTINCT FROM "bottleId") THEN
    RAISE EXCEPTION 'families_expand: a history line is not on the family of its bottle';
  END IF;
  IF (SELECT count(*) FROM "_CollectionProducts") <> (SELECT count(*) FROM "_CollectionItems") THEN
    RAISE EXCEPTION 'families_expand: collection links were not all copied';
  END IF;
END $$;

COMMIT;

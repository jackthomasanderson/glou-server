-- #837: a tasting keeps the bottle tasted as it was when tasted — its cellar
-- (id, set to NULL when the cellar is deleted, and name, kept then) and its
-- purchase day — written by the server from the bottle at creation. No
-- backfill: the bottle as it is now would be exactly the wrong cellar this
-- fixes; older tastings keep being shown from their bottle as it is now.
-- "snapshotAt" is set with the snapshot: a bottle in no cellar and without a
-- purchase day still reads as kept ("no cellar"), unlike an older tasting.

-- AlterTable
ALTER TABLE "tasting_notes" ADD COLUMN     "cellarId" TEXT,
ADD COLUMN     "snapshotAt" TIMESTAMP(3),
ADD COLUMN     "cellarName" TEXT,
ADD COLUMN     "purchasedAt" DATE;

-- CreateIndex
CREATE INDEX "tasting_notes_cellarId_idx" ON "tasting_notes"("cellarId");

-- AddForeignKey
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_cellarId_fkey" FOREIGN KEY ("cellarId") REFERENCES "cellars"("id") ON DELETE SET NULL ON UPDATE CASCADE;


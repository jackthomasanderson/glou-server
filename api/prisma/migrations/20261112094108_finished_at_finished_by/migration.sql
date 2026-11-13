-- #589: "consumed over the period" and the personal consumption goal read
-- when a bottle was finished, and by whom, from its last change (`updatedAt`,
-- `updatedBy`). Any later edit rewrote both: moving a finished bottle, a
-- count closure, a postponed suggestion counted it again as drunk that day,
-- by whoever touched it. From now on the write that finishes a unit stamps
-- `finishedAt`/`finishedBy` once (cleared if it is put back), and both
-- figures read the stamp.

-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "finishedBy" TEXT;

-- Backfill: the units already finished keep the dating they show today, their
-- last change. That includes the finished copies the families upgrade split
-- off older rows (#471, FEAT-94): they kept their id and `updatedAt` (a plain
-- UPDATE does not touch it), so none is dated to the upgrade. An author whose
-- account is gone is left empty, as the foreign key below would refuse it.
UPDATE "bottles" AS b
SET "finishedAt" = b."updatedAt",
    "finishedBy" = CASE WHEN EXISTS (SELECT 1 FROM "User" AS u WHERE u."id" = b."updatedBy") THEN b."updatedBy" END
WHERE b."isOpened" AND b."fillLevel" = 0;

-- AddForeignKey
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_finishedBy_fkey" FOREIGN KEY ("finishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

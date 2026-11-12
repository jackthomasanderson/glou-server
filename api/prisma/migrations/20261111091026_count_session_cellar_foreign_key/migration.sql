-- #597: a count session kept the id of the cellar it counts with no foreign
-- key behind it. Once that cellar was deleted, the dead id stayed: the report
-- found no expected bottle, and putting a bottle back "in the counted cellar"
-- broke the bottles' foreign key, so the count could never be closed. From now
-- on deleting the cellar empties the id (SET NULL) and the count goes on as a
-- free-label one.

-- A session whose cellar is already gone would refuse the constraint: it gets
-- the same treatment as the ones to come. Its label (`scopeLabel`) still says
-- which cellar it was.
UPDATE "inventory_count_sessions" AS s
SET "cellarId" = NULL
WHERE s."cellarId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "cellars" AS c WHERE c."id" = s."cellarId");

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_cellarId_fkey" FOREIGN KEY ("cellarId") REFERENCES "cellars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

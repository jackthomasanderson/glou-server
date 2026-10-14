-- ISSUE_098: `userId` on these shared-inventory-adjacent models is an audit
-- field ("who created this record"), not an ownership field (see
-- design.md) — deleting the member who created a bottle, cellar, tasting
-- note, stocktake session or humidor reading must never cascade-delete that
-- shared household data with them. Switch the five foreign keys from
-- ON DELETE CASCADE to ON DELETE RESTRICT: the database now refuses to
-- delete a User row while any such record still references them.
--
-- Deliberately left untouched (still CASCADE, genuinely personal data):
-- Session, TrustedDevice, WishlistItem, BudgetEnvelope, ConsumptionGoal,
-- BulkPreset, AuditLog, SyncQueueItem.

ALTER TABLE "cellars" DROP CONSTRAINT "cellars_userId_fkey";
ALTER TABLE "cellars" ADD CONSTRAINT "cellars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bottles" DROP CONSTRAINT "bottles_userId_fkey";
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasting_notes" DROP CONSTRAINT "tasting_notes_userId_fkey";
ALTER TABLE "tasting_notes" ADD CONSTRAINT "tasting_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_sessions" DROP CONSTRAINT "inventory_count_sessions_userId_fkey";
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "humidor_readings" DROP CONSTRAINT "humidor_readings_userId_fkey";
ALTER TABLE "humidor_readings" ADD CONSTRAINT "humidor_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data-model audit finding: the "who triggered/started this" concept was
-- spelled differently across models (`userId`, `startedBy`, `triggeredBy`,
-- `createdBy`) for the same audit-only semantics. Standardizing on `userId`
-- everywhere (GuestShare.createdBy was already renamed in the sibling
-- "guest_share_token_hash" migration). Plain RENAME COLUMN preserves data —
-- no drop+add.

-- InventoryCountSession.startedBy -> userId (FK column, rename the
-- constraint too so it stays self-descriptive).
ALTER TABLE "inventory_count_sessions" RENAME COLUMN "startedBy" TO "userId";
ALTER TABLE "inventory_count_sessions" RENAME CONSTRAINT "inventory_count_sessions_startedBy_fkey" TO "inventory_count_sessions_userId_fkey";

-- MaintenanceRun.triggeredBy -> userId (plain column, no FK).
ALTER TABLE "maintenance_runs" RENAME COLUMN "triggeredBy" TO "userId";

-- BackupRun.triggeredBy -> userId (plain column, no FK).
ALTER TABLE "backup_runs" RENAME COLUMN "triggeredBy" TO "userId";

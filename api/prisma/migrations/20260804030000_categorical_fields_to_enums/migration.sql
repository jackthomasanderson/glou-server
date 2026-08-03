-- Data-model audit finding: several categorical String fields with a known,
-- closed value set (previously documented only in a comment) are converted
-- to real Postgres/Prisma enums, adding a DB-level guard rail. Each one was
-- verified against every literal value assigned to it across api/src before
-- converting — deliberately conservative:
--   * ScanJob.status is NOT touched — kept as free-form String on purpose
--     (see scan.service.ts's own comment: new values like 'expired' were
--     added recently specifically to avoid a schema migration).
--   * AuditLog.action/status are NOT touched — action already has ~28
--     values and grows with every new feature router (same anti-pattern
--     ScanJob.status deliberately avoids), and AuditLog is a historical
--     append-only log whose full value history in a live instance can't be
--     verified from this environment.

-- CreateEnum
CREATE TYPE "InventoryCountSessionStatus" AS ENUM ('active', 'paused', 'completed');
CREATE TYPE "InventoryCountEntryStatus" AS ENUM ('confirmed', 'unexpected');
CREATE TYPE "RunTrigger" AS ENUM ('scheduled', 'manual');
CREATE TYPE "WishlistStatus" AS ENUM ('active', 'acquired', 'cancelled');
CREATE TYPE "AccessMode" AS ENUM ('direct', 'proxy');
CREATE TYPE "AlertStatus" AS ENUM ('none', 'approaching', 'peak', 'past');

-- AlterTable: inventory_count_sessions.status
ALTER TABLE "inventory_count_sessions" ALTER COLUMN "status" TYPE "InventoryCountSessionStatus" USING ("status"::"InventoryCountSessionStatus");

-- AlterTable: inventory_count_entries.status
ALTER TABLE "inventory_count_entries" ALTER COLUMN "status" TYPE "InventoryCountEntryStatus" USING ("status"::"InventoryCountEntryStatus");

-- AlterTable: maintenance_runs.trigger
ALTER TABLE "maintenance_runs" ALTER COLUMN "trigger" TYPE "RunTrigger" USING ("trigger"::"RunTrigger");

-- AlterTable: backup_runs.trigger
ALTER TABLE "backup_runs" ALTER COLUMN "trigger" TYPE "RunTrigger" USING ("trigger"::"RunTrigger");

-- AlterTable: wishlist_items.status (has a default)
ALTER TABLE "wishlist_items" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "wishlist_items" ALTER COLUMN "status" TYPE "WishlistStatus" USING ("status"::"WishlistStatus");
ALTER TABLE "wishlist_items" ALTER COLUMN "status" SET DEFAULT 'active'::"WishlistStatus";

-- AlterTable: SystemConfig.accessMode (has a default)
ALTER TABLE "SystemConfig" ALTER COLUMN "accessMode" DROP DEFAULT;
ALTER TABLE "SystemConfig" ALTER COLUMN "accessMode" TYPE "AccessMode" USING ("accessMode"::"AccessMode");
ALTER TABLE "SystemConfig" ALTER COLUMN "accessMode" SET DEFAULT 'direct'::"AccessMode";

-- AlterTable: bottles.alertStatus (nullable, no default — auto-computed by
-- alert.service.ts#computeAlertStatus, never user input)
ALTER TABLE "bottles" ALTER COLUMN "alertStatus" TYPE "AlertStatus" USING ("alertStatus"::"AlertStatus");

-- #476: collections are shared by the household; `userId` stays as who
-- created one and a collection outlives its author's account (SET NULL).
-- #695: an administrator can delete a member for good. Their audit and
-- configuration history rows stay, detached (SET NULL), with the name they
-- were shown under kept in `actorName` (filled by the deletion itself).
-- Budget envelopes are household-wide (ISSUE_142): like the other shared
-- rows, they no longer go with their author's account (CASCADE -> RESTRICT;
-- the deletion re-attributes them first).
-- No data change: existing rows keep their author.

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "collections" DROP CONSTRAINT "collections_userId_fkey";

-- DropForeignKey
ALTER TABLE "config_change_logs" DROP CONSTRAINT "config_change_logs_userId_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actorName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "collections" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "config_change_logs" ADD COLUMN     "actorName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_change_logs" ADD CONSTRAINT "config_change_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "budget_envelopes" DROP CONSTRAINT "budget_envelopes_userId_fkey";

-- AddForeignKey
ALTER TABLE "budget_envelopes" ADD CONSTRAINT "budget_envelopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

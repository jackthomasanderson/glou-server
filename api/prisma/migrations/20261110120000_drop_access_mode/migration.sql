-- #617: the "Access mode" setting was saved but never read by anything (the
-- reverse-proxy trust is configured by the deployment, not by this column).
ALTER TABLE "SystemConfig" DROP COLUMN "accessMode";
DROP TYPE "AccessMode";

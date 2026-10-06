-- #233: scheduled backups are on by default on a NEW configuration row.
-- Only the column default changes: existing rows keep the operator's setting
-- (an explicit "off" cannot be told apart from the old silent default).
ALTER TABLE "SystemConfig" ALTER COLUMN "backupEnabled" SET DEFAULT true;

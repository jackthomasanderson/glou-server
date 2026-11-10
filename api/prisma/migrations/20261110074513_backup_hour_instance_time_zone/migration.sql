-- #761: the backup hour was a UTC hour while every other scheduled job runs in
-- the instance's time zone (`TZ`). The column now holds an hour of that zone.
-- SQL cannot know the API container's `TZ`, so the stored value is kept as is
-- and flagged: the API converts it once at startup
-- (backupService.convertLegacyUtcBackupHour), then clears the flag. A row
-- created after this migration (fresh install) is already in local time.
ALTER TABLE "SystemConfig" RENAME COLUMN "backupHourUtc" TO "backupHour";
ALTER TABLE "SystemConfig" ADD COLUMN "backupHourIsUtc" BOOLEAN NOT NULL DEFAULT false;
UPDATE "SystemConfig" SET "backupHourIsUtc" = true;

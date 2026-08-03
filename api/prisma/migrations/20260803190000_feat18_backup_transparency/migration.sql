-- FEAT-18: Portabilité & Souveraineté des Données — Scheduled Backups

-- AlterTable
ALTER TABLE "SystemConfig"
    ADD COLUMN     "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "backupRetentionDays" INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN     "backupHourUtc" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "success" BOOLEAN NOT NULL,
    "filePath" TEXT,
    "fileSizeBytes" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER,
    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_runs_runAt_idx" ON "backup_runs"("runAt");

-- FEAT-39: Maintenance & Data Retention

-- AlterTable
ALTER TABLE "SystemConfig"
    ADD COLUMN     "logRetentionDays" INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN     "sessionRetentionDays" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN     "guestShareRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "maintenance_runs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "success" BOOLEAN NOT NULL,
    "counts" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    CONSTRAINT "maintenance_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "maintenance_runs_runAt_idx" ON "maintenance_runs"("runAt");

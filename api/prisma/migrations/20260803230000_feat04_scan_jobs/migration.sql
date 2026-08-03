-- FEAT-04: Scan Étiquette & Ajout Express — DB-persisted job queue

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extractedData" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_jobs_userId_idx" ON "scan_jobs"("userId");

-- CreateIndex
CREATE INDEX "scan_jobs_status_idx" ON "scan_jobs"("status");

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

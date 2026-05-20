-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "alertsPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "peakMaturityFrom" INTEGER,
ADD COLUMN     "peakMaturityTo" INTEGER;

-- CreateIndex
CREATE INDEX "bottles_alertStatus_idx" ON "bottles"("alertStatus");

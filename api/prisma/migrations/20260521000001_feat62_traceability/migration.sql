-- FEAT-62: Traceability — track last editor per bottle
ALTER TABLE "bottles" ADD COLUMN "updatedBy" TEXT;
CREATE INDEX "bottles_updatedBy_idx" ON "bottles"("updatedBy");

-- #588: a bottle's history (the drawer, "Restore this value") is read by
-- bottle, newest first; the retention purge now keeps it, so it only grows.
-- CreateIndex
CREATE INDEX "audit_logs_bottleId_createdAt_idx" ON "audit_logs"("bottleId", "createdAt");

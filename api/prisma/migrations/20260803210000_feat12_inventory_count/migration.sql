-- FEAT-12: Inventaire Physique Assisté & Réconciliation

-- CreateTable
CREATE TABLE "inventory_count_sessions" (
    "id" TEXT NOT NULL,
    "scopeLabel" TEXT NOT NULL,
    "cellarId" TEXT,
    "status" TEXT NOT NULL,
    "startedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_entries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_count_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_count_sessions_status_idx" ON "inventory_count_sessions"("status");

-- CreateIndex
CREATE INDEX "inventory_count_entries_sessionId_idx" ON "inventory_count_entries"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_entries_sessionId_itemId_key" ON "inventory_count_entries"("sessionId", "itemId");

-- AddForeignKey
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_startedBy_fkey" FOREIGN KEY ("startedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_entries" ADD CONSTRAINT "inventory_count_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_entries" ADD CONSTRAINT "inventory_count_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "bottles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "guest_shares" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "hidePrices" BOOLEAN NOT NULL DEFAULT false,
    "hideNotes" BOOLEAN NOT NULL DEFAULT false,
    "cellarIds" TEXT[],
    "collectionIds" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_shares_token_key" ON "guest_shares"("token");

-- CreateIndex
CREATE INDEX "guest_shares_createdBy_idx" ON "guest_shares"("createdBy");

-- CreateIndex
CREATE INDEX "guest_shares_token_idx" ON "guest_shares"("token");

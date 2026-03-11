-- CreateTable
CREATE TABLE "bulk_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_presets_userId_idx" ON "bulk_presets"("userId");

-- AddForeignKey
ALTER TABLE "bulk_presets" ADD CONSTRAINT "bulk_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

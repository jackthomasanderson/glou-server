-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "storageZoneId" TEXT;

-- CreateTable
CREATE TABLE "storage_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "cellarId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_zones_cellarId_idx" ON "storage_zones"("cellarId");

-- CreateIndex
CREATE INDEX "storage_zones_parentId_idx" ON "storage_zones"("parentId");

-- AddForeignKey
ALTER TABLE "storage_zones" ADD CONSTRAINT "storage_zones_cellarId_fkey" FOREIGN KEY ("cellarId") REFERENCES "cellars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_zones" ADD CONSTRAINT "storage_zones_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "storage_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_storageZoneId_fkey" FOREIGN KEY ("storageZoneId") REFERENCES "storage_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `brand` on the `bottles` table. All the data in the column will be lost.
  - You are about to drop the column `distilleryName` on the `bottles` table. All the data in the column will be lost.
  - You are about to drop the column `peakMaturity` on the `bottles` table. All the data in the column will be lost.
  - You are about to drop the column `sealedStatus` on the `bottles` table. All the data in the column will be lost.
  - The `declaredAge` column on the `bottles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "bottles" DROP COLUMN "brand",
DROP COLUMN "distilleryName",
DROP COLUMN "peakMaturity",
DROP COLUMN "sealedStatus",
ADD COLUMN     "spiritType" TEXT,
DROP COLUMN "declaredAge",
ADD COLUMN     "declaredAge" INTEGER;

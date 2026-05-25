-- DropIndex
DROP INDEX "bottles_updatedBy_idx";

-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "slotColumn" INTEGER,
ADD COLUMN     "slotRow" INTEGER;

-- AlterTable
ALTER TABLE "cellars" ADD COLUMN     "coldZoneRows" INTEGER,
ADD COLUMN     "columns" INTEGER,
ADD COLUMN     "hotZoneRows" INTEGER,
ADD COLUMN     "rows" INTEGER;

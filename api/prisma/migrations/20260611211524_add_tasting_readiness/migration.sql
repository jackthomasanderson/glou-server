-- CreateEnum
CREATE TYPE "TastingReadiness" AS ENUM ('TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST');

-- AlterTable
ALTER TABLE "tasting_notes" ADD COLUMN     "readiness" "TastingReadiness";

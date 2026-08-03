-- FEAT-30: Quick Lock & Auto-Lock

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "autoLockDelayMin" INTEGER;

-- CreateEnum
CREATE TYPE "DateFormat" AS ENUM ('SYSTEM', 'H24', 'H12');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT '#6366f1',
ADD COLUMN     "dateFormat" "DateFormat" NOT NULL DEFAULT 'SYSTEM';

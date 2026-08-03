-- FEAT-54: Network Configuration & External Access (Admin)

-- AlterTable
ALTER TABLE "SystemConfig"
    ADD COLUMN     "publicUrl" TEXT,
    ADD COLUMN     "accessMode" TEXT NOT NULL DEFAULT 'direct';

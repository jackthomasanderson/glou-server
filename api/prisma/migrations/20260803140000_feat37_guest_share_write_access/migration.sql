-- FEAT-37: Guest share granular write access & invitee display name

-- AlterTable
ALTER TABLE "guest_shares" ADD COLUMN     "writeCellarIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "inviteeName" TEXT;

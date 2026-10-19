-- #336: administrator password reset (no-SMTP instances) forces a real
-- password choice on the member's next login.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

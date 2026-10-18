-- ISSUE_001/#73: close anonymous registration by default once the instance
-- already has an account; admins opt back in from the admin panel.
ALTER TABLE "SystemConfig" ADD COLUMN "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

-- #513: new accounts follow the OS light/dark setting until they pick one.
-- Existing accounts keep their stored LIGHT/DARK value.
-- Rollback: ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'LIGHT';
ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'SYSTEM';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT;

-- Backfill: for existing rows without username, derive from email
UPDATE "users"
SET "username" = LOWER(SPLIT_PART(email, '@', 1)) || '_' || SUBSTR("id"::text, 1, 6)
WHERE "username" IS NULL;

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE "users"
  ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users"("username");

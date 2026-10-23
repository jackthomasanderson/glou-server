-- FEAT-90: "Later" in the setup wizard postpones it for the current sign-in
-- only, so it is stored on the session. Nullable, no backfill: existing
-- sessions are simply not postponed. Rollback: DROP COLUMN "onboardingPostponedAt".
ALTER TABLE "sessions" ADD COLUMN "onboardingPostponedAt" TIMESTAMP(3);

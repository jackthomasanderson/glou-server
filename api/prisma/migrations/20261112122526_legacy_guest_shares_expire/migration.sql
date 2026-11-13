-- #614 (owner decision, option 1): guest links created before #119 / PR #444 could
-- have no expiry ("never") and no scope (no cellar and no collection, which opens
-- the whole inventory). New links can no longer be created that way. Every active
-- link with no expiry, or with no scope and an expiry more than 30 days away, now
-- expires 30 days after this migration runs. An earlier expiry is never pushed
-- back, and revoked or already expired links are left as they are. Creators can
-- make a new, scoped link if a guest still needs one.
-- Prisma stores these columns as UTC timestamps without time zone, hence the
-- explicit conversion of now(). The scope arrays are nullable columns: NULL counts as
-- empty, like [].
UPDATE "guest_shares"
SET "expiresAt" = (now() AT TIME ZONE 'UTC') + interval '30 days',
    "updatedAt" = now() AT TIME ZONE 'UTC'
WHERE "revokedAt" IS NULL
  AND (
    "expiresAt" IS NULL
    OR (
      COALESCE(cardinality("cellarIds"), 0) = 0
      AND COALESCE(cardinality("collectionIds"), 0) = 0
      AND "expiresAt" > (now() AT TIME ZONE 'UTC') + interval '30 days'
    )
  );

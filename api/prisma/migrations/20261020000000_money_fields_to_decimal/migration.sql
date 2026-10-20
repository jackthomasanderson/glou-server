-- ISSUE_172: monetary amounts were stored as double-precision floats,
-- which can drift by fractions of a cent across storage and SQL SUM()
-- aggregates. NUMERIC(12,2) stores the exact decimal value and sums
-- exactly in Postgres. The explicit ::numeric cast preserves existing
-- values (rounded to the nearest cent, same rounding float display
-- already implied) rather than reinterpreting their binary representation.
ALTER TABLE "bottles"
  ALTER COLUMN "purchasePrice" TYPE DECIMAL(12, 2) USING ROUND("purchasePrice"::numeric, 2),
  ALTER COLUMN "estimatedValue" TYPE DECIMAL(12, 2) USING ROUND("estimatedValue"::numeric, 2);

ALTER TABLE "wishlist_items"
  ALTER COLUMN "maxPrice" TYPE DECIMAL(12, 2) USING ROUND("maxPrice"::numeric, 2),
  ALTER COLUMN "lastSeenPrice" TYPE DECIMAL(12, 2) USING ROUND("lastSeenPrice"::numeric, 2);

ALTER TABLE "budget_envelopes"
  ALTER COLUMN "amount" TYPE DECIMAL(12, 2) USING ROUND("amount"::numeric, 2);

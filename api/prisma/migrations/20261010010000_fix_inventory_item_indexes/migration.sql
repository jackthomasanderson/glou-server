-- ISSUE_004: `userId` on `bottles` (InventoryItem) is an audit field, never
-- queried alone or as the leading column of a filter (design.md;
-- `listInventory` ignores it) — so the two composite indexes leading with it
-- served no query (a composite index only serves a query filtering on its
-- FIRST column) while still costing on every write. Replaced with indexes
-- that actually match what the code filters on everywhere: `deletedAt`
-- alone (36+ `where` clauses across the repo), `cellarId` + `deletedAt`
-- (per-cellar stats, guest share scoping), `category` + `deletedAt`
-- (analytics breakdowns).

DROP INDEX "bottles_userId_deletedAt_idx";
DROP INDEX "bottles_userId_category_idx";

CREATE INDEX "bottles_deletedAt_idx" ON "bottles"("deletedAt");
CREATE INDEX "bottles_cellarId_deletedAt_idx" ON "bottles"("cellarId", "deletedAt");
CREATE INDEX "bottles_category_deletedAt_idx" ON "bottles"("category", "deletedAt");

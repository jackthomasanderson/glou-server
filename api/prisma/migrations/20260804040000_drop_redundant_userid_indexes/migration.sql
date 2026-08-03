-- Data-model audit finding: standalone `userId` indexes that are always
-- redundant next to a composite index already starting with `userId`
-- (leftmost-prefix rule — Postgres can serve a `userId`-only lookup from the
-- composite just as well). Write-cost with zero read benefit. The
-- GuestShare equivalent (`token`/`tokenHash`) was already handled in the
-- "guest_share_token_hash" migration (dropped implicitly along with the
-- `token` column).
--
--   * bottles: redundant with `bottles_userId_deletedAt_idx` /
--     `bottles_userId_category_idx` — `userId` is also audit-only on this
--     model (design.md), never used as a query filter on its own.
--   * sessions: redundant with `sessions_userId_revokedAt_idx`.
--   * wishlist_items: redundant with `wishlist_items_userId_status_idx`.

DROP INDEX "bottles_userId_idx";
DROP INDEX "sessions_userId_idx";
DROP INDEX "wishlist_items_userId_idx";

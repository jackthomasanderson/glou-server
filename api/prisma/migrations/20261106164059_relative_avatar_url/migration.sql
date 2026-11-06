-- #668: uploaded avatars were saved as an absolute address built from an
-- undocumented API_URL (by default http://localhost:3001/uploads/avatars/…),
-- which a production stack never publishes. They are now saved relative, as
-- product photos are; this rewrites the existing ones the same way. Only the
-- exact shape the upload route produced is touched (scheme, host, then
-- /uploads/avatars/<file>), so an avatar hosted elsewhere is left as is.
-- Idempotent: a relative path no longer matches. No rollback needed.
UPDATE "User"
SET "avatarUrl" = regexp_replace("avatarUrl", '^https?://[^/]+', '')
WHERE "avatarUrl" ~ '^https?://[^/]+/uploads/avatars/[A-Za-z0-9-]+\.[a-z]+$';

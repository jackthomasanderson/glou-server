-- #668: uploaded avatars were saved as an absolute address built from an
-- undocumented API_URL (by default http://localhost:3001/uploads/avatars/…),
-- which a production stack never publishes. They are now saved relative, as
-- product photos are; this rewrites the existing ones the same way. Only the
-- shape the upload route produced is touched: scheme, host, then exactly
-- /uploads/avatars/<file>, where <file> is a UUID-based name with any-case
-- extension or none (files uploaded before 2026-08 kept the client's
-- extension, e.g. `.JPG`). An address of that exact shape on another host is
-- rewritten too (it could only be set through a direct API call); any other
-- address is left as is. Idempotent: a relative path no longer matches.
UPDATE "User"
SET "avatarUrl" = regexp_replace("avatarUrl", '^https?://[^/]+', '')
WHERE "avatarUrl" ~ '^https?://[^/]+/uploads/avatars/[A-Za-z0-9-]+(\.[A-Za-z0-9]+)?$';

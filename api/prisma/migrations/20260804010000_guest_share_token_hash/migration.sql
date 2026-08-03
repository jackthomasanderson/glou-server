-- Security audit finding: GuestShare.token was stored in clear text and had
-- no dedicated brute-force protection on the guest resolution routes (the
-- rate limiter is added in app code, see api/src/routes/guest.router.ts /
-- api/src/index.ts). This migration hashes the token at rest (SHA-256, same
-- pattern as PasswordResetToken.tokenHash / TrustedDevice.tokenHash) and
-- renames `createdBy` to `userId` for naming consistency with the rest of
-- the schema (see the sibling "rename_owner_columns_to_userid" migration for
-- the other models affected by that same cleanup).
--
-- Existing active share links keep working: rather than invalidating every
-- share already handed out, we hash the CURRENT plaintext token in place
-- (pgcrypto's digest() matches Node's crypto.createHash('sha256')...digest
-- ('hex') byte-for-byte), so a guest holding an old link is unaffected.
-- Only NEW shares (created after this migration) are minted with a real
-- crypto.randomBytes(32) token — see shares.service.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable: add the hashed column, backfill, then swap it in for `token`.
ALTER TABLE "guest_shares" ADD COLUMN "tokenHash" TEXT;
UPDATE "guest_shares" SET "tokenHash" = encode(digest("token", 'sha256'), 'hex');
ALTER TABLE "guest_shares" ALTER COLUMN "tokenHash" SET NOT NULL;

-- Dropping `token` also drops its dependent unique index
-- ("guest_shares_token_key") and the redundant explicit index
-- ("guest_shares_token_idx" — dead weight next to the unique index, same
-- class of issue fixed schema-wide in the "drop_redundant_userid_indexes"
-- migration).
ALTER TABLE "guest_shares" DROP COLUMN "token";

CREATE UNIQUE INDEX "guest_shares_tokenHash_key" ON "guest_shares"("tokenHash");

-- Rename `createdBy` -> `userId` (owner-column naming cleanup, Task 2).
ALTER TABLE "guest_shares" RENAME COLUMN "createdBy" TO "userId";
ALTER INDEX "guest_shares_createdBy_idx" RENAME TO "guest_shares_userId_idx";

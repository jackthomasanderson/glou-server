-- ISSUE_043: per-account throttling of the 6-digit two-factor code.
-- The per-IP rate limiter can be sidestepped by rotating addresses, so the
-- consecutive-failure counter is stored on the account itself. When the
-- budget is spent, "twoFactorLockedUntil" holds the end of the cooling-off
-- period and the counter is reset; any successful verification clears both.

ALTER TABLE "User" ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "twoFactorLockedUntil" TIMESTAMP(3);

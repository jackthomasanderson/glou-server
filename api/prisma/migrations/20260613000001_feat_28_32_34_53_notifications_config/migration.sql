-- FEAT-28: Password Reset Tokens
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FEAT-34/53: System Configuration (singleton)
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEnc" TEXT,
    "smtpFrom" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "gotifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gotifyUrl" TEXT,
    "gotifyTokenEnc" TEXT,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vivinoKeyEnc" TEXT,
    "whiskybaseKeyEnc" TEXT,
    "ocrUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- FEAT-34: Config Change History
CREATE TABLE "config_change_logs" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "maskedOldVal" TEXT,
    "maskedNewVal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "config_change_logs_userId_idx" ON "config_change_logs"("userId");
CREATE INDEX "config_change_logs_createdAt_idx" ON "config_change_logs"("createdAt");

ALTER TABLE "config_change_logs" ADD CONSTRAINT "config_change_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FEAT-32: User notification preferences
ALTER TABLE "User"
    ADD COLUMN "notifInApp" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "notifEmail" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "notifWebhook" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "notifCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "notifQuietStart" INTEGER,
    ADD COLUMN "notifQuietEnd" INTEGER,
    ADD COLUMN "notifLanguage" "Language",
    ADD COLUMN "webhookUrl" TEXT;

-- #924: the SMTP security becomes a three-way mode. STARTTLS is now required
-- (no silent fall-back to clear text), and "no encryption" is an explicit
-- choice for a trusted local relay. Each instance keeps its current choice:
-- secure = true (implicit TLS) becomes TLS, secure = false becomes STARTTLS.
CREATE TYPE "SmtpSecurity" AS ENUM ('TLS', 'STARTTLS', 'NONE');

ALTER TABLE "SystemConfig" ADD COLUMN "smtpSecurity" "SmtpSecurity" NOT NULL DEFAULT 'STARTTLS';

UPDATE "SystemConfig"
SET "smtpSecurity" = CASE WHEN "smtpSecure" THEN 'TLS' ELSE 'STARTTLS' END::"SmtpSecurity";

ALTER TABLE "SystemConfig" DROP COLUMN "smtpSecure";

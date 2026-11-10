-- #763: a fresh SMTP form must work on port 587, which expects STARTTLS
-- ("secure" = false in nodemailer); "secure" = true is implicit TLS (port 465).
ALTER TABLE "SystemConfig" ALTER COLUMN "smtpSecure" SET DEFAULT false;
-- Only never-configured instances: a configured one keeps its working combination.
UPDATE "SystemConfig" SET "smtpSecure" = false WHERE "smtpHost" IS NULL;

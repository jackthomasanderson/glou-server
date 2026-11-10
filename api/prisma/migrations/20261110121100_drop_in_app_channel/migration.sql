-- #671: the "in-app notifications" channel was a setting (administration
-- switch and member preference) that nothing ever delivered through: no
-- notification was ever shown in the interface because of it. It is removed.
-- The bell in the header is unrelated (peak-maturity alerts and reminders).
ALTER TABLE "User" DROP COLUMN IF EXISTS "notifInApp";
ALTER TABLE "SystemConfig" DROP COLUMN IF EXISTS "inAppEnabled";

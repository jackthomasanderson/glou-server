-- #767: every Gotify notification now goes to the instance's Gotify server
-- (URL + app token in Administration), which the administrator can read.
-- Members only opt in or out (`notifWebhook`). Nobody agreed to send their
-- alerts to that server: every opt-in is reset, members turn Gotify back on
-- in their profile if they want it. The address each member typed is no
-- longer used by anything and is discarded.
UPDATE "User" SET "notifWebhook" = false WHERE "notifWebhook" = true;
ALTER TABLE "User" DROP COLUMN IF EXISTS "webhookUrl";

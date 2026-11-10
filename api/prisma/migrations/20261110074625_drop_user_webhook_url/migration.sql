-- #767: every Gotify notification now goes to the instance's Gotify server
-- (URL + app token in Administration); a member only opts in or out
-- (`notifWebhook`, kept). The address each member typed is no longer used
-- by anything and is discarded.
ALTER TABLE "User" DROP COLUMN IF EXISTS "webhookUrl";

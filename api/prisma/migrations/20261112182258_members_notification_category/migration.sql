-- #981: the notices sent to administrators about other members' accounts (a
-- deletion requested, accounts deleted after the grace period) leave the
-- `security` category, now mandatory, for a new admin-only `members` category.
-- An admin who saved a partial list (an empty list means "every category")
-- received those notices through `security`; without this line they would
-- silently stop. `members` is appended to such lists, admins only (members
-- never received these notices). Idempotent: a list that already holds
-- `members` is left as it is.
UPDATE "User"
SET "notifCategories" = array_append("notifCategories", 'members')
WHERE "isAdmin"
  AND cardinality("notifCategories") > 0
  AND 'security' = ANY("notifCategories")
  AND NOT ('members' = ANY("notifCategories"));

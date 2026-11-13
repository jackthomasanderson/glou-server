#!/usr/bin/env bash
# #981 migration bench: the `*_members_notification_category` migration on an
# instance at the previous schema, in the E2E stack's PostgreSQL, through the
# API image the stack built. The admin notices about members' accounts move
# from `security` to the new `members` category: an admin whose saved list
# (not "every category") holds `security` keeps receiving them. Nothing else
# changes, and the migration is idempotent.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-members-category-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"
database=glou_members_category_bench

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

target=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_members_notification_category' -printf '%f\n')
[ -n "$target" ] || { echo "No *_members_notification_category migration in $migrations." >&2; exit 1; }
migrations_before "$work/before" "$target"

echo "::group::Instance at the schema before $target"
fresh_database "$database"
migrate_on "$database" -v "$work/before:/app/prisma/migrations:ro" >/dev/null
# a1: admin, partial list with security -> gains members
# a2: admin, every category ([]) -> unchanged
# a3: admin, partial list without security -> unchanged (did not get the notices)
# a4: admin, already holds members -> unchanged
# m1: member, partial list with security -> unchanged (never got the notices)
psql_on "$database" </dev/null -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"isAdmin\", \"notifCategories\", \"updatedAt\") VALUES
  ('00000000-0000-4000-8000-0000000009a1', 'a1', 'a1@example.test', 'x', true,  '{peak,security}',         now()),
  ('00000000-0000-4000-8000-0000000009a2', 'a2', 'a2@example.test', 'x', true,  '{}',                      now()),
  ('00000000-0000-4000-8000-0000000009a3', 'a3', 'a3@example.test', 'x', true,  '{peak,backup}',           now()),
  ('00000000-0000-4000-8000-0000000009a4', 'a4', 'a4@example.test', 'x', true,  '{security,members}',      now()),
  ('00000000-0000-4000-8000-0000000009b1', 'm1', 'm1@example.test', 'x', false, '{wishlist,security}',     now())"
echo "::endgroup::"

echo "::group::Update: every migration left, $target included"
migrate_on "$database"
echo "::endgroup::"

expected="a1|{peak,security,members}
a2|{}
a3|{peak,backup}
a4|{security,members}
m1|{wishlist,security}"
read_lists() { psql_on "$database" -tA </dev/null -c "SELECT \"username\" || '|' || \"notifCategories\"::text FROM \"User\" ORDER BY \"username\""; }
actual=$(read_lists)
if [ "$actual" != "$expected" ]; then
  echo "Category lists after the migration:"
  diff <(echo "$expected") <(echo "$actual") || true
  exit 1
fi

# Idempotent: the same statement run again changes nothing.
psql_on "$database" < "$migrations/$target/migration.sql"
again=$(read_lists)
[ "$again" = "$expected" ] || { echo "A second run changed the lists:"; diff <(echo "$expected") <(echo "$again") || true; exit 1; }

docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "Admins who received member account notices keep them; nothing else changes."

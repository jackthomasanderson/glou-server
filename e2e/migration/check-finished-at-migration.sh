#!/usr/bin/env bash
# #589 migration bench: the `*_finished_at_finished_by` migration on an
# instance at the previous schema, in the E2E stack's PostgreSQL, through the
# API image the stack built. The units already finished (opened, level 0)
# keep the dating they show today: `finishedAt` = their last change,
# `finishedBy` = its author when that account still exists. Nothing else is
# stamped, and no unit's `updatedAt` moves.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-finished-at-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"
database=glou_finished_at_bench

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

finished=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_finished_at_finished_by' -printf '%f\n')
[ -n "$finished" ] || { echo "No *_finished_at_finished_by migration in $migrations." >&2; exit 1; }
migrations_before "$work/before" "$finished"

marie=00000000-0000-4000-8000-0000000005a1
paul=00000000-0000-4000-8000-0000000005a2
wine=00000000-0000-4000-8000-0000000005f1
cigar=00000000-0000-4000-8000-0000000005f2

echo "::group::Instance at the schema before $finished"
fresh_database "$database"
migrate_on "$database" -v "$work/before:/app/prisma/migrations:ro" >/dev/null
psql_on "$database" </dev/null -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"updatedAt\") VALUES
  ('$marie', 'marie', 'marie@example.test', 'x', now()),
  ('$paul',  'paul',  'paul@example.test',  'x', now())" \
  -c "INSERT INTO \"products\" (\"id\", \"userId\", \"category\", \"name\", \"producer\", \"updatedAt\") VALUES
  ('$wine',  '$marie', 'wine',  'Talbot',  'Château Talbot', now()),
  ('$cigar', '$marie', 'cigar', 'Robusto', 'Partagás',       now())" \
  -c "INSERT INTO \"bottles\" (\"id\", \"userId\", \"productId\", \"quantity\", \"isOpened\", \"fillLevel\", \"cigarsPerBox\", \"cigarsLeft\", \"updatedBy\", \"updatedAt\") VALUES
  ('00000000-0000-4000-8000-0000000005b1', '$marie', '$wine',  1, true,  0,    NULL, NULL, '$marie', '2026-03-10 20:00:00'),
  ('00000000-0000-4000-8000-0000000005b2', '$marie', '$wine',  1, true,  0,    NULL, NULL, '00000000-0000-4000-8000-00000000dead', '2026-04-01 08:00:00'),
  ('00000000-0000-4000-8000-0000000005b3', '$marie', '$wine',  1, true,  0,    NULL, NULL, NULL,     '2026-05-01 08:00:00'),
  ('00000000-0000-4000-8000-0000000005b4', '$marie', '$wine',  1, true,  40,   NULL, NULL, '$paul',  '2026-06-01 08:00:00'),
  ('00000000-0000-4000-8000-0000000005b5', '$marie', '$wine',  6, false, NULL, NULL, NULL, '$paul',  '2026-07-01 08:00:00'),
  ('00000000-0000-4000-8000-0000000005b6', '$marie', '$cigar', 1, true,  0,    25,   0,    '$paul',  '2026-08-01 08:00:00'),
  ('00000000-0000-4000-8000-0000000005b7', '$marie', '$cigar', 1, true,  NULL, 25,   10,   '$paul',  '2026-09-01 08:00:00')"
echo "::endgroup::"

echo "::group::Update: every migration left, $finished included"
migrate_on "$database"
echo "::endgroup::"

# id | updatedAt | finishedAt | finishedBy: drunk by Marie, by a deleted
# account (no author), never edited (no author), an opened bottle, a group,
# a finished box of cigars, an opened box.
expected="b1|2026-03-10 20:00:00|2026-03-10 20:00:00|marie
b2|2026-04-01 08:00:00|2026-04-01 08:00:00|
b3|2026-05-01 08:00:00|2026-05-01 08:00:00|
b4|2026-06-01 08:00:00||
b5|2026-07-01 08:00:00||
b6|2026-08-01 08:00:00|2026-08-01 08:00:00|paul
b7|2026-09-01 08:00:00||"
actual=$(psql_on "$database" -tA </dev/null -c "SELECT right(b.\"id\", 2) || '|' || to_char(b.\"updatedAt\", 'YYYY-MM-DD HH24:MI:SS') || '|'
  || coalesce(to_char(b.\"finishedAt\", 'YYYY-MM-DD HH24:MI:SS'), '') || '|' || coalesce(u.\"username\", '')
  FROM \"bottles\" b LEFT JOIN \"User\" u ON u.\"id\" = b.\"finishedBy\" ORDER BY b.\"id\"")
if [ "$actual" != "$expected" ]; then
  echo "Finished stamps after the migration:"
  diff <(echo "$expected") <(echo "$actual") || true
  exit 1
fi

# The author's account deleted later: the consumption stays, without its author.
psql_on "$database" </dev/null -c "DELETE FROM \"User\" WHERE \"id\" = '$paul'"
left=$(psql_on "$database" -tA </dev/null -c "SELECT coalesce(\"finishedBy\", 'none') || '|' || to_char(\"finishedAt\", 'YYYY-MM-DD') FROM \"bottles\" WHERE \"id\" = '00000000-0000-4000-8000-0000000005b6'")
[ "$left" = "none|2026-08-01" ] || { echo "After deleting the author: $left" >&2; exit 1; }

docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "Finished units keep their dating, nothing else is stamped."

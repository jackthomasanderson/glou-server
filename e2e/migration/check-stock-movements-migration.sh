#!/usr/bin/env bash
# #848 migration bench: the `*_stock_movements` migration on an instance at
# the previous schema, in the E2E stack's PostgreSQL, through the API image
# the stack built. Each wine's journal starts with one line "Update: N in the
# cellar", N its units in stock counted by the single rule (itemUnits,
# shared/units.ts): finished, written-off and trashed units hold nothing, an
# opened bottle one, an opened box its cigars left, boxes their cigars.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-stock-movements-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"
database=glou_stock_movements_bench

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

journal=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_stock_movements' -printf '%f\n')
[ -n "$journal" ] || { echo "No *_stock_movements migration in $migrations." >&2; exit 1; }
migrations_before "$work/before" "$journal"

marie=00000000-0000-4000-8000-000000000848
nine=00000000-0000-4000-8000-0000000008f1
cigars=00000000-0000-4000-8000-0000000008f2
drunk=00000000-0000-4000-8000-0000000008f3
empty=00000000-0000-4000-8000-0000000008f4

echo "::group::Instance at the schema before $journal"
fresh_database "$database"
migrate_on "$database" -v "$work/before:/app/prisma/migrations:ro" >/dev/null
psql_on "$database" </dev/null -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"updatedAt\") VALUES
  ('$marie', 'marie', 'marie@example.test', 'x', now())" \
  -c "INSERT INTO \"products\" (\"id\", \"userId\", \"category\", \"name\", \"producer\", \"updatedAt\") VALUES
  ('$nine',   '$marie', 'wine',  'Talbot',  'Château Talbot', now()),
  ('$cigars', '$marie', 'cigar', 'Robusto', 'Partagás',       now()),
  ('$drunk',  '$marie', 'wine',  'Gloria',  'Château Gloria', now()),
  ('$empty',  '$marie', 'wine',  'Known',   'Tasted only',    now())" \
  -c "INSERT INTO \"bottles\" (\"id\", \"userId\", \"productId\", \"quantity\", \"isOpened\", \"fillLevel\", \"cigarsPerBox\", \"cigarsLeft\", \"writtenOffAt\", \"deletedAt\", \"updatedAt\") VALUES
  ('00000000-0000-4000-8000-0000000008b1', '$marie', '$nine',   6,    false, NULL, NULL, NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b2', '$marie', '$nine',   2,    false, NULL, NULL, NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b3', '$marie', '$nine',   1,    true,  40,   NULL, NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b4', '$marie', '$nine',   1,    true,  0,    NULL, NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b5', '$marie', '$nine',   3,    false, NULL, NULL, NULL, now(), NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b6', '$marie', '$nine',   4,    false, NULL, NULL, NULL, NULL,  now(), now()),
  ('00000000-0000-4000-8000-0000000008b7', '$marie', '$cigars', 2,    false, NULL, 25,   NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b8', '$marie', '$cigars', 1,    true,  NULL, 25,   10,   NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008b9', '$marie', '$cigars', 3,    false, NULL, NULL, NULL, NULL,  NULL,  now()),
  ('00000000-0000-4000-8000-0000000008ba', '$marie', '$drunk',  1,    true,  0,    NULL, NULL, NULL,  NULL,  now())"
echo "::endgroup::"

echo "::group::Update: every migration left, $journal included"
migrate_on "$database"
echo "::endgroup::"

# wine | kind | difference | count | author: 6 + 2 + an opened bottle (a
# finished, a written-off and a trashed line hold nothing) = 9; two boxes of
# 25 + 10 left in an opened box + 3 single cigars = 63; a wine drunk and a
# wine known without bottle start at 0.
expected="f1|INITIAL|9|9|
f2|INITIAL|63|63|
f3|INITIAL|0|0|
f4|INITIAL|0|0|"
actual=$(psql_on "$database" -tA </dev/null -c "SELECT right(\"productId\", 2) || '|' || \"kind\" || '|' || \"delta\" || '|' || \"count\" || '|' || coalesce(\"userId\", '')
  FROM \"stock_movements\" ORDER BY \"productId\"")
if [ "$actual" != "$expected" ]; then
  echo "Journal after the migration:"
  diff <(echo "$expected") <(echo "$actual") || true
  exit 1
fi

docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "Each wine's journal starts with its units in stock."

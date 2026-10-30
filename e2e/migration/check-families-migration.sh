#!/usr/bin/env bash
# #471 migration bench: the families migrations on real data, in the E2E
# stack's PostgreSQL 15, through the API image the stack built.
#
#   1. a new database is migrated up to the schema just before the first
#      `*_families_*` migration (truncated copy of the migrations folder);
#   2. fixtures/before-families.sql loads a small instance into it;
#   3. the image's own `prisma migrate deploy` applies the rest, as on an
#      update;
#   4. checks/*.sql verify the result (each lists its failures, then fails);
#   5. a second `migrate deploy` must find nothing to apply and change nothing.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-families-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
export COMPOSE_FILE="$root/docker-compose.e2e.yml"
database=glou_migration_bench

# Same server and credentials as the stack, another database.
stack_url=$(docker compose exec -T api printenv DATABASE_URL </dev/null)
bench_url="${stack_url%/*}/$database"

# Single statements or a file on stdin; stops at the first SQL error.
psql_bench() { docker compose exec -T db psql -U glou -d "$database" -v ON_ERROR_STOP=1 -q "$@"; }
# stdin closed: `run`/`exec` would otherwise wait on it.
migrate() { docker compose run --rm --no-deps -T -e DATABASE_URL="$bench_url" "$@" api npx prisma migrate deploy </dev/null; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

migrations="$root/api/prisma/migrations"
first_families=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_families_*' -printf '%f\n' | sort | head -n 1)
[ -n "$first_families" ] || { echo "No *_families_* migration in $migrations."; exit 1; }
mkdir "$work/migrations"
cp "$migrations/migration_lock.toml" "$work/migrations/"
for dir in "$migrations"/*/; do
  name=$(basename "$dir")
  if [[ "$name" < "$first_families" ]]; then cp -r "$dir" "$work/migrations/$name"; fi
done
# Read by the API image's user (uid 1001).
chmod -R a+rX "$work"

echo "::group::Schema before $first_families"
docker compose exec -T db psql -U glou -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS $database" -c "CREATE DATABASE $database" </dev/null
migrate -v "$work/migrations:/app/prisma/migrations:ro"
echo "::endgroup::"

echo "::group::Instance data"
psql_bench < "$here/fixtures/before-families.sql"
echo "::endgroup::"

echo "::group::Update: the image's migrations"
migrate
echo "::endgroup::"

for check in "$here"/checks/*.sql; do
  echo "::group::$(basename "$check")"
  # Results go nowhere: the checks speak through NOTICE / WARNING / EXCEPTION.
  psql_bench -o /dev/null < "$check"
  echo "::endgroup::"
done

echo "::group::A second start applies nothing"
before=$(psql_bench -tA -c 'SELECT count(*) FROM "products"' -c 'SELECT count(*) FROM _prisma_migrations' </dev/null)
second=$(migrate 2>&1) || { echo "$second"; exit 1; }
echo "$second"
after=$(psql_bench -tA -c 'SELECT count(*) FROM "products"' -c 'SELECT count(*) FROM _prisma_migrations' </dev/null)
if [ "$before" != "$after" ] || ! grep -q 'No pending migrations' <<<"$second"; then
  echo "The second migrate deploy changed something (families, migrations): $before -> $after"
  exit 1
fi
echo "::endgroup::"

echo "The families migrations pass the bench."

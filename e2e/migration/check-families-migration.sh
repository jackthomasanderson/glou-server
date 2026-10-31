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
#   5. parity/: the SQL copy of the shared rules (units, value, spending,
#      productKey, groupKey) answers the case table the TypeScript tests read
#      (fixtures/units-cases.json);
#   6. a second `migrate deploy` must find nothing to apply and change nothing;
#   7. the failure path: on another database, an inconsistency the transform
#      cannot reconcile makes it raise, roll everything back, say why, and
#      leave the migration marked failed (P3009) instead of half applied;
#   8. duration: the migrations on a synthetic instance of 5,000 records must
#      stay well within the API's start-up time (a quadratic step once took
#      minutes and made the healthcheck fail).
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-families-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
export COMPOSE_FILE="$root/docker-compose.e2e.yml"
database=glou_migration_bench
failing=glou_migration_bench_failure
timed=glou_migration_bench_duration
records=5000
max_seconds=30

# Same server and credentials as the stack, other databases.
stack_url=$(docker compose exec -T api printenv DATABASE_URL </dev/null)

# Single statements or a file on stdin; stops at the first SQL error.
psql_on() { local db=$1; shift; docker compose exec -T db psql -U glou -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }
psql_bench() { psql_on "$database" "$@"; }
# stdin closed: `run`/`exec` would otherwise wait on it.
migrate_on() {
  local db=$1; shift
  docker compose run --rm --no-deps -T -e DATABASE_URL="${stack_url%/*}/$db" "$@" api npx prisma migrate deploy </dev/null
}
migrate() { migrate_on "$database" "$@"; }
fresh_database() {
  docker compose exec -T db psql -U glou -d postgres -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" </dev/null
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

migrations="$root/api/prisma/migrations"
# A copy of the migrations folder holding only the migrations before $2, in $1.
migrations_before() {
  mkdir "$1"
  cp "$migrations/migration_lock.toml" "$1/"
  for dir in "$migrations"/*/; do
    name=$(basename "$dir")
    if [[ "$name" < "$2" ]]; then cp -r "$dir" "$1/$name"; fi
  done
  # Read by the API image's user (uid 1001).
  chmod -R a+rX "$1"
}
first_families=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_families_*' -printf '%f\n' | sort | head -n 1)
[ -n "$first_families" ] || { echo "No *_families_* migration in $migrations."; exit 1; }
# The migration holding the shared rules (the transform).
rules_file=$(grep -l '^-- >>> families rules' "$migrations"/*/migration.sql | head -n 1)
[ -n "$rules_file" ] || { echo "No migration holds the '>>> families rules' block."; exit 1; }
transform=$(basename "$(dirname "$rules_file")")
migrations_before "$work/before-families" "$first_families"

echo "::group::Schema before $first_families"
fresh_database "$database"
migrate -v "$work/before-families:/app/prisma/migrations:ro"
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

echo "::group::Shared rules: SQL against the TypeScript case table"
{
  sed -n '/^-- >>> families rules/,/^-- <<< families rules/p' "$rules_file"
  echo "SELECT set_config('bench.cases', \$cases\$"
  cat "$here/fixtures/units-cases.json"
  echo "\$cases\$, false);"
  cat "$here/parity/families-rules.sql"
} | psql_bench -o /dev/null
echo "::endgroup::"

echo "::group::A second start applies nothing"
# Everything the transform touches, in one fingerprint.
fingerprint() {
  psql_bench -tA </dev/null -c "SELECT md5(concat_ws('|',
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM bottles t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM products t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM tasting_notes t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM audit_logs t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM inventory_count_entries t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM bulk_presets t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.\"A\", t.\"B\") FROM \"_CollectionProducts\" t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.\"A\", t.\"B\") FROM \"_CollectionItems\" t),
    (SELECT count(*) FROM _prisma_migrations)::TEXT))"
}
before=$(fingerprint)
second=$(migrate 2>&1) || { echo "$second"; exit 1; }
echo "$second"
after=$(fingerprint)
if [ "$before" != "$after" ] || ! grep -q 'No pending migrations' <<<"$second"; then
  echo "The second migrate deploy changed something: $before -> $after"
  exit 1
fi
echo "::endgroup::"

echo "::group::Failure path: an inconsistency rolls the whole transform back"
# Same instance, migrated up to the transform; then a tasting is put on the
# family of another wine than its bottle's, which the transform's final
# checks refuse (FEAT-94 criterion 4). When the expand and transform steps are
# merged into one migration (lot Z), move this tampering to a pre-families
# inconsistency.
migrations_before "$work/before-transform" "$transform"
fresh_database "$failing"
migrate_on "$failing" -v "$work/before-families:/app/prisma/migrations:ro" >/dev/null
psql_on "$failing" < "$here/fixtures/before-families.sql"
if [ "$transform" != "$first_families" ]; then
  migrate_on "$failing" -v "$work/before-transform:/app/prisma/migrations:ro" >/dev/null
fi
psql_on "$failing" </dev/null -c "UPDATE tasting_notes SET \"productId\" = '00000000-0000-4000-8000-0000000000b3'
      WHERE id = '00000000-0000-4000-8000-0000000000d1'"
state() {
  psql_on "$failing" -tA </dev/null -c "SELECT concat_ws(' ',
    (SELECT count(*) FROM products), (SELECT count(*) FROM bottles),
    (SELECT count(*) FROM bottles WHERE \"needsReview\" OR \"cigarsPerBox\" IS NOT NULL OR NOT \"isOwned\"),
    (SELECT count(*) FROM bulk_presets))"
}
untouched=$(state)
if failed=$(migrate_on "$failing" 2>&1); then
  echo "$failed"
  echo "The transform applied over an inconsistent tasting: it must refuse."
  exit 1
fi
echo "$failed"
if ! grep -q "families_transform: a tasting was lost or is not on the family of its bottle" <<<"$failed"; then
  echo "The failure does not say why in plain words."
  exit 1
fi
if [ "$(state)" != "$untouched" ]; then
  echo "The failed transform left changes behind: $untouched -> $(state)"
  exit 1
fi
again=$(migrate_on "$failing" 2>&1) && { echo "$again"; echo "A restart after the failure must not migrate."; exit 1; }
echo "$again"
if ! grep -q 'P3009' <<<"$again"; then
  echo "A restart after the failure must report the failed migration (P3009)."
  exit 1
fi
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $failing" </dev/null
echo "::endgroup::"

echo "::group::Duration: $records records"
fresh_database "$timed"
migrate_on "$timed" -v "$work/before-families:/app/prisma/migrations:ro" >/dev/null
sed "s/:N/$records/g" "$here/fixtures/perf-families.sql" | psql_on "$timed"
start=$(date +%s%N)
migrate_on "$timed" >/dev/null
seconds=$(( ($(date +%s%N) - start) / 1000000000 ))
psql_on "$timed" -tA </dev/null -c 'SELECT count(*) || $$ families, $$ || (SELECT count(*) FROM bottles) || $$ units$$ FROM products'
echo "The families migrations took ${seconds} s for $records records (limit ${max_seconds} s)."
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $timed" </dev/null
if [ "$seconds" -gt "$max_seconds" ]; then
  echo "Too slow: an update must not keep the API from starting."
  exit 1
fi
echo "::endgroup::"

echo "The families migrations pass the bench."

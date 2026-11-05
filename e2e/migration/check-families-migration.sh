#!/usr/bin/env bash
# #471 migration bench: the families migration (one file: expansion,
# transformation, contraction) on real data, in the E2E stack's PostgreSQL
# 15, through the API image the stack built.
#
#   1. a new database is migrated up to the schema just before the
#      `*_families_*` migration (truncated copy of the migrations folder):
#      the schema of `dev`, which every instance runs before this update;
#   2. fixtures/before-families.sql loads a small instance into it;
#   3. the image's own `prisma migrate deploy` applies the families
#      migration, as on an update. Migrations shipped after it are left out
#      (copy of the folder up to and including it) here and in the steps
#      below, except the backup step: a later one may change what the checks
#      read (FEAT-93 drops bottles.slotColumn/slotRow), and has its own bench;
#   4. checks/*families*.sql verify the result (each lists its failures, then fails):
#      the data transformed, and the columns the contraction removed gone;
#   5. parity/: the SQL copy of the shared rules (units, value, spending,
#      productKey, groupKey) answers the case table the TypeScript tests read
#      (fixtures/units-cases.json);
#   6. a second `migrate deploy` must find nothing to apply and change nothing;
#   7. the failure path: on another database, an inconsistency the transform
#      cannot reconcile makes it raise, roll everything back (the expansion's
#      tables and columns included), say why, and leave the migration marked
#      failed (P3009) instead of half applied;
#   8. a pg_dump taken before the migration is told apart from one taken
#      after it, as the in-app restore reads them (it refuses the former);
#   9. duration: the migration on a synthetic instance of 5,000 records must
#      stay well within the API's start-up time (a quadratic step once took
#      minutes and made the healthcheck fail).
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-families-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# root, migrations, COMPOSE_FILE, stack_url, psql_on, migrate_on,
# fresh_database, migrations_before, migrations_through.
source "$here/lib.sh"
database=glou_migration_bench
failing=glou_migration_bench_failure
timed=glou_migration_bench_duration
records=5000
max_seconds=30

psql_bench() { psql_on "$database" "$@"; }
migrate() { migrate_on "$database" "$@"; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

families=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_families_*' -printf '%f\n' | sort)
# One families migration only, found by name: migrations dated after it
# (shipped later) may exist, the bench stops at it (step 3).
[ "$(wc -l <<<"$families")" = 1 ] && [ -n "$families" ] \
  || { echo "Expected exactly one *_families_* migration in $migrations, found: $families"; exit 1; }
first_families=$families
# The shared rules block lives in it.
rules_file="$migrations/$families/migration.sql"
grep -q '^-- >>> families rules' "$rules_file" || { echo "$families holds no '>>> families rules' block."; exit 1; }
migrations_before "$work/before-families" "$first_families"
migrations_through "$work/through-families" "$first_families"
# Mounted over the image's migrations: the schema up to the families.
before_families=(-v "$work/before-families:/app/prisma/migrations:ro")
through_families=(-v "$work/through-families:/app/prisma/migrations:ro")

echo "::group::Schema before $first_families"
fresh_database "$database"
migrate "${before_families[@]}"
echo "::endgroup::"

echo "::group::Instance data"
psql_bench < "$here/fixtures/before-families.sql"
echo "::endgroup::"

echo "::group::Update: the image's migrations up to $first_families"
migrate "${through_families[@]}"
echo "::endgroup::"

for check in "$here"/checks/*families*.sql; do
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
    (SELECT count(*) FROM _prisma_migrations)::TEXT))"
}
before=$(fingerprint)
second=$(migrate "${through_families[@]}" 2>&1) || { echo "$second"; exit 1; }
echo "$second"
after=$(fingerprint)
if [ "$before" != "$after" ] || ! grep -q 'No pending migrations' <<<"$second"; then
  echo "The second migrate deploy changed something: $before -> $after"
  exit 1
fi
echo "::endgroup::"

echo "::group::Failure path: an inconsistency rolls the whole migration back"
# Same instance, at the schema before the families. A trigger stands for an
# inconsistency the transform cannot reconcile: when the transform deletes
# the bulk presets that wrote a state (its last data step, after every
# family, group and split is written), it puts a tasting on the family of
# another wine than its bottle's, which the final checks refuse (FEAT-94
# criterion 4). Everything must be rolled back, the expansion included.
fresh_database "$failing"
migrate_on "$failing" "${before_families[@]}" >/dev/null
psql_on "$failing" < "$here/fixtures/before-families.sql"
psql_on "$failing" <<'SQL'
CREATE FUNCTION bench_misplace_tasting() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "tasting_notes" t SET "productId" = (
    SELECT p."id" FROM "products" p WHERE p."id" IS DISTINCT FROM t."productId" ORDER BY p."id" LIMIT 1)
  WHERE t."id" = '00000000-0000-4000-8000-0000000000d1';
  RETURN NULL;
END $$;
CREATE TRIGGER bench_misplace_tasting AFTER DELETE ON "bulk_presets"
  FOR EACH STATEMENT EXECUTE FUNCTION bench_misplace_tasting();
SQL
# What the update must leave untouched: no family table, every column of
# `bottles` (the description and isOwned too), the unit collections, the data.
state() {
  psql_on "$failing" -tA </dev/null -c "SELECT concat_ws(' ',
    coalesce(to_regclass('products')::TEXT, 'no-products'),
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bottles'),
    coalesce(to_regclass('\"_CollectionItems\"')::TEXT, 'no-collection-items'),
    (SELECT md5(string_agg(t::TEXT, ',' ORDER BY t.id)) FROM bottles t),
    (SELECT md5(string_agg(t::TEXT, ',' ORDER BY t.id)) FROM tasting_notes t),
    (SELECT count(*) FROM bulk_presets))"
}
untouched=$(state)
echo "Before: $untouched"
if failed=$(migrate_on "$failing" "${through_families[@]}" 2>&1); then
  echo "$failed"
  echo "The migration applied over an inconsistent tasting: it must refuse."
  exit 1
fi
echo "$failed"
if ! grep -q "families: a tasting was lost or is not on the family of its bottle. The migration was rolled back" <<<"$failed"; then
  echo "The failure does not say why in plain words."
  exit 1
fi
if [ "$(state)" != "$untouched" ]; then
  echo "The failed migration left changes behind: $untouched -> $(state)"
  exit 1
fi
again=$(migrate_on "$failing" "${through_families[@]}" 2>&1) && { echo "$again"; echo "A restart after the failure must not migrate."; exit 1; }
echo "$again"
if ! grep -q 'P3009' <<<"$again"; then
  echo "A restart after the failure must report the failed migration (P3009)."
  exit 1
fi
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $failing" </dev/null
echo "::endgroup::"

echo "::group::A backup taken before the migration: refused by the in-app restore"
# The admin page's restore reads which migrations a dump holds (pg_dump's
# real output) and refuses one of another version, before writing anything:
# restored under this API, a backup taken before the update would leave it
# on tables it does not know (lib/backup-version.ts, wiki 30/31).
versions=glou_migration_bench_versions
fresh_database "$versions"
migrate_on "$versions" "${before_families[@]}" >/dev/null
psql_on "$versions" < "$here/fixtures/before-families.sql"
mkdir "$work/dumps"
docker compose exec -T db pg_dump -U glou -d "$versions" </dev/null | gzip > "$work/dumps/before.sql.gz"
migrate_on "$versions" >/dev/null
docker compose exec -T db pg_dump -U glou -d "$versions" </dev/null | gzip > "$work/dumps/after.sql.gz"
chmod -R a+rX "$work/dumps"
verdicts=$(docker compose run --rm --no-deps -T -v "$work/dumps:/dumps:ro" api node -e "
  const v = require('./dist/api/src/lib/backup-version');
  Promise.all(['before', 'after'].map((name) => v.dumpedMigrations('/dumps/' + name + '.sql.gz')))
    .then((dumps) => console.log(dumps.map((d) => v.compareVersions(v.shippedMigrations(), d)).join(' ')));
" </dev/null)
echo "Backup before the migration, after it: $verdicts"
[ "$verdicts" = "older same" ] || { echo "Expected 'older same'."; exit 1; }
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $versions" </dev/null
echo "::endgroup::"

echo "::group::Duration: $records records"
fresh_database "$timed"
migrate_on "$timed" "${before_families[@]}" >/dev/null
sed "s/:N/$records/g" "$here/fixtures/perf-families.sql" | psql_on "$timed"
start=$(date +%s%N)
migrate_on "$timed" "${through_families[@]}" >/dev/null
seconds=$(( ($(date +%s%N) - start) / 1000000000 ))
psql_on "$timed" -tA </dev/null -c 'SELECT count(*) || $$ families, $$ || (SELECT count(*) FROM bottles) || $$ units$$ FROM products'
echo "The families migration took ${seconds} s for $records records (limit ${max_seconds} s)."
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $timed" </dev/null
if [ "$seconds" -gt "$max_seconds" ]; then
  echo "Too slow: an update must not keep the API from starting."
  exit 1
fi
echo "::endgroup::"

echo "The families migration passes the bench."

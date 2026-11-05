#!/usr/bin/env bash
# FEAT-93 migration bench: the slots migration (`*_item_slots`, one file:
# expansion, transformation, contraction) on real data, in the E2E stack's
# PostgreSQL 15, through the API image the stack built.
#
#   1. a new database is migrated up to the families migration included
#      (the schema of the release before this one), loaded with
#      fixtures/before-families.sql before the families migration (its cells
#      kept, 604/605 left apart for theirs), then fixtures/before-slots.sql;
#   2. the image's own `prisma migrate deploy` applies every migration left,
#      the slots migration and any shipped after it, as on an update;
#   3. checks/*slots*.sql verify the result: the cells, the groups fused, the
#      coordinates left behind, the schema left;
#   4. the shared rules block of the slots migration is, byte for byte, the
#      one of the families migration (the bench of the families checks it
#      against the TypeScript case table);
#   5. a second `migrate deploy` must find nothing to apply and change nothing;
#   6. the guard: a count lowered under a unit's cells is refused at commit,
#      accepted when the cells are freed in the same transaction; deleting a
#      cellar whose units hold cells takes their slots with it (#579);
#   7. the failure path: on another database, a cell moved during the
#      transformation makes the final checks raise and roll everything back
#      (no item_slots, the columns still there), say why, and leave the
#      migration marked failed (P3009) instead of half applied;
#   8. a pg_dump taken before the migration is told apart from one taken
#      after it, as the in-app restore reads them (it refuses the former);
#   9. duration: the migration on a synthetic instance of 5,000 placed groups,
#      half of them fusing, must stay well within the API's start-up time.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-slots-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# root, migrations, COMPOSE_FILE, stack_url, psql_on, migrate_on,
# fresh_database, migrations_before, migrations_through.
source "$here/lib.sh"
database=glou_slots_bench
failing=glou_slots_bench_failure
timed=glou_slots_bench_duration
groups=5000
max_seconds=30

psql_bench() { psql_on "$database" "$@"; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

# One migration of each, found by name: migrations shipped after the slots
# migration may exist and are applied with it, as on an update.
only_one() {
  local found
  found=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name "$1" -printf '%f\n' | sort)
  [ "$(wc -l <<<"$found")" = 1 ] && [ -n "$found" ] \
    || { echo "Expected exactly one $1 migration in $migrations, found: $found" >&2; exit 1; }
  echo "$found"
}
families=$(only_one '*_families_*')
slots=$(only_one '*_item_slots')
migrations_before "$work/before-families" "$families"
migrations_through "$work/through-families" "$families"
before_families=(-v "$work/before-families:/app/prisma/migrations:ro")
through_families=(-v "$work/through-families:/app/prisma/migrations:ro")

# The instance just before the update: the families fixture through the
# families migration, then the slots fixture at that schema.
instance_before_slots() {
  fresh_database "$1"
  migrate_on "$1" "${before_families[@]}" >/dev/null
  psql_on "$1" < "$here/fixtures/before-families.sql"
  migrate_on "$1" "${through_families[@]}" >/dev/null
  psql_on "$1" < "$here/fixtures/before-slots.sql"
}

echo "::group::Instance at the schema of $families"
instance_before_slots "$database"
echo "::endgroup::"

echo "::group::Update: every migration left, $slots included"
migrate_on "$database"
echo "::endgroup::"

for check in "$here"/checks/*slots*.sql; do
  echo "::group::$(basename "$check")"
  # Results go nowhere: the checks speak through NOTICE / WARNING / EXCEPTION.
  psql_bench -o /dev/null < "$check"
  echo "::endgroup::"
done

echo "::group::Shared rules: the same block as the families migration"
rules() { sed -n '/^-- >>> families rules/,/^-- <<< families rules/p' "$migrations/$1/migration.sql"; }
[ -n "$(rules "$slots")" ] || { echo "$slots holds no '>>> families rules' block."; exit 1; }
if ! diff <(rules "$families") <(rules "$slots"); then
  echo "The rules block of $slots differs from the one of $families: copy it verbatim."
  exit 1
fi
echo "Identical."
echo "::endgroup::"

echo "::group::A second start applies nothing"
fingerprint() {
  psql_bench -tA </dev/null -c "SELECT md5(concat_ws('|',
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM bottles t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM item_slots t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM tasting_notes t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM audit_logs t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM inventory_count_entries t),
    (SELECT string_agg(t::TEXT, ',' ORDER BY t.id) FROM wishlist_items t),
    (SELECT count(*) FROM _prisma_migrations)::TEXT))"
}
before=$(fingerprint)
second=$(migrate_on "$database" 2>&1) || { echo "$second"; exit 1; }
echo "$second"
after=$(fingerprint)
if [ "$before" != "$after" ] || ! grep -q 'No pending migrations' <<<"$second"; then
  echo "The second migrate deploy changed something: $before -> $after"
  exit 1
fi
echo "::endgroup::"

echo "::group::The guard: a unit never holds more cells than its copies"
# 871, a spirit group x2 in one cell; 811, a group x6 in two cells.
unit() { echo "'00000000-0000-4000-8000-000000000$1'"; }
if refused=$(psql_bench </dev/null -c "UPDATE bottles SET \"quantity\" = 1, \"isOpened\" = true, \"fillLevel\" = 0 WHERE id = $(unit 871)" 2>&1); then
  echo "$refused"
  echo "A finished unit kept its cell: the guard must refuse it."
  exit 1
fi
grep -q 'item_slots_guard' <<<"$refused" || { echo "$refused"; echo "Refused, but not by the guard."; exit 1; }
if refused=$(psql_bench </dev/null -c "UPDATE bottles SET \"quantity\" = 1 WHERE id = $(unit 811)" 2>&1); then
  echo "$refused"
  echo "A group x1 kept two cells: the guard must refuse it."
  exit 1
fi
grep -q 'item_slots_guard' <<<"$refused" || { echo "$refused"; echo "Refused, but not by the guard."; exit 1; }
# Accepted when the cell is freed in the same transaction, in either order.
psql_bench </dev/null -c "BEGIN;
  UPDATE bottles SET \"quantity\" = 1 WHERE id = $(unit 811);
  DELETE FROM item_slots WHERE \"itemId\" = $(unit 811) AND \"column\" = 2;
  COMMIT;"
[ "$(psql_bench -tA </dev/null -c "SELECT count(*) FROM item_slots WHERE \"itemId\" = $(unit 811)")" = 1 ] \
  || { echo "The count and the freed cell were not written together."; exit 1; }
# A unit cannot change cellar while it holds cells (the API frees them first).
if refused=$(psql_bench </dev/null -c "UPDATE bottles SET \"cellarId\" = '00000000-0000-4000-8000-0000000000c1' WHERE id = $(unit 871)" 2>&1); then
  echo "$refused"
  echo "A unit moved to another cellar with its cell: the key must refuse it."
  exit 1
fi
echo "$refused"
# Deleting a cellar: its slots go with it, its units stay, without a cellar.
psql_bench </dev/null -c "DELETE FROM cellars WHERE id = '00000000-0000-4000-8000-0000000008c3'"
[ "$(psql_bench -tA </dev/null -c "SELECT count(*) FROM item_slots WHERE \"cellarId\" = '00000000-0000-4000-8000-0000000008c3'")" = 0 ] \
  && [ "$(psql_bench -tA </dev/null -c "SELECT count(*) FROM bottles WHERE id = $(unit 871) AND \"cellarId\" IS NULL")" = 1 ] \
  || { echo "Deleting a cellar left slots behind, or took its units."; exit 1; }
echo "Refused under the cells, accepted with them freed; a deleted cellar frees its cells."
echo "::endgroup::"

echo "::group::Failure path: a cell lost in the transformation rolls the whole migration back"
# Same instance. A trigger stands for a step that loses track of a cell:
# when the transformation deletes the groups it fused (its last data step),
# it moves one slot to another cell, which the final checks refuse.
instance_before_slots "$failing"
psql_on "$failing" <<'SQL'
CREATE FUNCTION bench_move_slot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "item_slots" SET "column" = 99, "row" = 99
  WHERE "id" = (SELECT "id" FROM "item_slots" ORDER BY "id" LIMIT 1);
  RETURN NULL;
END $$;
CREATE TRIGGER bench_move_slot AFTER DELETE ON "bottles"
  FOR EACH STATEMENT EXECUTE FUNCTION bench_move_slot();
SQL
# What the update must leave untouched: no slot table, every column of
# `bottles`, the data.
state() {
  psql_on "$failing" -tA </dev/null -c "SELECT concat_ws(' ',
    coalesce(to_regclass('item_slots')::TEXT, 'no-item-slots'),
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'bottles'),
    coalesce(to_regclass('bottles_cellar_slot_unique')::TEXT, 'no-unique-index'),
    (SELECT md5(string_agg(t::TEXT, ',' ORDER BY t.id)) FROM bottles t),
    (SELECT md5(string_agg(t::TEXT, ',' ORDER BY t.id)) FROM tasting_notes t))"
}
untouched=$(state)
echo "Before: $untouched"
if failed=$(migrate_on "$failing" 2>&1); then
  echo "$failed"
  echo "The migration applied over a lost cell: it must refuse."
  exit 1
fi
echo "$failed"
if ! grep -q "slots: an occupied slot of the cellar plan was lost or moved. The migration was rolled back" <<<"$failed"; then
  echo "The failure does not say why in plain words."
  exit 1
fi
if [ "$(state)" != "$untouched" ]; then
  echo "The failed migration left changes behind: $untouched -> $(state)"
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

echo "::group::A backup taken before the migration: refused by the in-app restore"
versions=glou_slots_bench_versions
instance_before_slots "$versions"
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

echo "::group::Duration: $groups placed groups"
fresh_database "$timed"
migrate_on "$timed" "${through_families[@]}" >/dev/null
sed "s/:N/$groups/g" "$here/fixtures/perf-slots.sql" | psql_on "$timed"
start=$(date +%s%N)
migrate_on "$timed" >/dev/null
seconds=$(( ($(date +%s%N) - start) / 1000000000 ))
psql_on "$timed" -tA </dev/null -c 'SELECT count(*) || $$ units, $$ || (SELECT count(*) FROM item_slots) || $$ slots$$ FROM bottles'
echo "The slots migration took ${seconds} s for $groups groups (limit ${max_seconds} s)."
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $timed" </dev/null
if [ "$seconds" -gt "$max_seconds" ]; then
  echo "Too slow: an update must not keep the API from starting."
  exit 1
fi
echo "::endgroup::"

echo "The slots migration passes the bench."

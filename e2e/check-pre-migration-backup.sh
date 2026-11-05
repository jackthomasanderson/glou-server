#!/usr/bin/env bash
# FEAT-94 / design.md "Sauvegarde & Migration": the API image backs the
# database up before applying pending migrations, and does not start when
# that backup fails. Checked on the real image, pg_dump and PostgreSQL of the
# E2E stack:
#   1. the stack's first start (new database) took no backup and said so;
#   2. with one migration made pending again on a database that has accounts,
#      the step writes glou-backup-before-migration-*.sql.gz to ./backups;
#   3. started again with the migration still pending but no failed attempt
#      recorded in _prisma_migrations, the step takes a new backup (the data
#      may have changed); with a failed migration row newer than that backup
#      (what restart: unless-stopped does after a failed migrate deploy), it
#      reuses that backup and writes no new file;
#   4. once Glou has run since that backup, with ./backups owned by root (the
#      usual Linux mistake), the image's own start command stops with a
#      [backup] message and migrates nothing.
#
# Usage, with the E2E stack up and after the Playwright suite has run (it
# creates the accounts):
#   bash e2e/check-pre-migration-backup.sh
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
export COMPOSE_FILE="$root/docker-compose.e2e.yml"
backups="$root/backups"

psql_e2e() { docker compose exec -T db psql -U glou -d glou_e2e -v ON_ERROR_STOP=1 -tA "$@" </dev/null; }
before_migration_files() { find "$backups" -maxdepth 1 -name 'glou-backup-before-migration-*.sql.gz' | sort; }

echo "::group::1. New database: no backup at first start"
if [ "$(docker compose logs api | grep -c '\[backup\] New database: no backup needed before migrating.')" = 0 ]; then
  echo "The API's first start did not log the pre-migration check:"
  docker compose logs api | head -40
  exit 1
fi
[ -z "$(before_migration_files)" ] || { echo "A pre-migration backup was taken on a new database."; exit 1; }
echo "::endgroup::"

users=$(psql_e2e -c 'SELECT count(*) FROM "User"')
[ "$users" -ge 1 ] || { echo "No account in the database: run the Playwright suite first."; exit 1; }

# Makes the latest migration pending again without touching the schema: its
# history row is renamed, then put back whatever happens.
latest=$(psql_e2e -c 'SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1')
hidden="${latest}__e2e_hidden"
restore_history() {
  psql_e2e -c "UPDATE _prisma_migrations SET migration_name = '$latest' WHERE migration_name = '$hidden'" >/dev/null || true
  psql_e2e -c "DELETE FROM backup_runs WHERE id = 'e2e-pre-migration'" >/dev/null || true
  psql_e2e -c "DELETE FROM _prisma_migrations WHERE id = 'e2e-failed-attempt'" >/dev/null || true
  sudo chown 1001:1001 "$backups" || true
}
trap restore_history EXIT
psql_e2e -c "UPDATE _prisma_migrations SET migration_name = '$hidden' WHERE migration_name = '$latest'" >/dev/null
echo "Made $latest pending again ($users account(s) in the database)."

echo "::group::2. Pending migration on a database in use: backup written"
set +e
out=$(docker compose run --rm --no-deps -T api node dist/api/src/scripts/pre-migrate.js 2>&1)
code=$?
set -e
echo "$out"
[ "$code" = 0 ] || { echo "The pre-migration step failed (exit $code)."; exit 1; }
files=$(before_migration_files)
[ "$(printf '%s\n' "$files" | grep -c .)" = 1 ] || { echo "Expected one pre-migration backup, found: $files"; exit 1; }
gunzip -t "$files"
[ "$(gunzip -c "$files" | grep -c 'CREATE TABLE public."User"')" -gt 0 ] || { echo "$files does not hold the User table."; exit 1; }
[ "$(gunzip -c "$files" | grep -c "$hidden")" -gt 0 ] || { echo "$files was not taken from this database."; exit 1; }
grep -q "$latest" <<<"$out" || { echo "The log does not name the pending migration."; exit 1; }
echo "Backup written: $files"
echo "::endgroup::"

pre_migrate() { docker compose run --rm --no-deps -T api node dist/api/src/scripts/pre-migrate.js 2>&1; }

echo "::group::3. Started again: a new backup without a failed attempt, the same one with it"
set +e
out=$(pre_migrate)
code=$?
set -e
echo "$out"
[ "$code" = 0 ] || { echo "The pre-migration step failed on the second start (exit $code)."; exit 1; }
[ "$(before_migration_files | grep -c .)" = 2 ] \
  || { echo "No failed migration row: expected a new backup, found: $(before_migration_files)"; exit 1; }
newest=$(before_migration_files | tail -1)

# What a failed prisma migrate deploy leaves: a row that started, never finished.
psql_e2e -c "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES ('e2e-failed-attempt', 'e2e', '${latest}__e2e_failed', now(), 0)" >/dev/null
set +e
out=$(pre_migrate)
code=$?
set -e
echo "$out"
[ "$code" = 0 ] || { echo "The pre-migration step failed on the restart after a failed deploy (exit $code)."; exit 1; }
grep -q "No new backup: /app/backups/$(basename "$newest")" <<<"$out" || { echo "The earlier backup was not reused."; exit 1; }
[ "$(before_migration_files | grep -c .)" = 2 ] || { echo "Another pre-migration backup was written: $(before_migration_files)"; exit 1; }
psql_e2e -c "DELETE FROM _prisma_migrations WHERE id = 'e2e-failed-attempt'" >/dev/null
echo "::endgroup::"

echo "::group::4. Glou ran since, backups folder owned by root: the start command stops before migrating"
# A failed attempt, but Glou ran since (an API start lists the file in the
# backup history): the data may have changed, so a new backup is needed.
psql_e2e -c "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES ('e2e-failed-attempt', 'e2e', '${latest}__e2e_failed', now(), 0)" >/dev/null
psql_e2e -c "INSERT INTO backup_runs (id, \"runAt\", trigger, success, \"filePath\") VALUES ('e2e-pre-migration', now(), 'scheduled', true, '/app/backups/$(basename "$newest")')" >/dev/null
sudo chown root:root "$backups"
sudo chmod 755 "$backups"
set +e
# The image's own CMD (no command given). If the step wrongly let it through,
# the server would start and never exit: bounded by timeout.
out=$(timeout 180 docker compose run --rm --no-deps -T api 2>&1)
code=$?
set -e
echo "$out"
[ "$code" != 0 ] || { echo "The API start command did not fail."; exit 1; }
[ "$code" != 124 ] || { echo "The API start command did not stop (timeout)."; exit 1; }
grep -q '^\[backup\] Migrations are pending, but /app/backups is not writable' <<<"$out" \
  || { echo "No explicit [backup] message."; exit 1; }
grep -q 'sudo chown 1001:1001 backups' <<<"$out" || { echo "The message does not say how to fix the folder."; exit 1; }
applied=$(psql_e2e -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '$latest'")
[ "$applied" = 0 ] || { echo "A migration ran although the backup failed."; exit 1; }
[ "$(before_migration_files | grep -c .)" = 2 ] || { echo "A file was left behind by the failed backup."; exit 1; }
echo "::endgroup::"

echo "The pre-migration backup is taken when needed, and its failure stops the start."

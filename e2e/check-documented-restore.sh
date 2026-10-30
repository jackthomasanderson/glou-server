#!/usr/bin/env bash
# #665: runs the restore command of the disaster-recovery wiki page (page 30),
# exactly as written there, on the backup that tests/backup-restore.spec.ts
# downloaded through the app: once as Glou produces it today, once with the
# `SET transaction_timeout` line older backups carry. Each time into an empty
# database of the E2E stack's PostgreSQL 15 server.
#
# Usage, with the E2E stack up and after the Playwright suite has run:
#   bash e2e/check-documented-restore.sh
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
downloaded="$root/e2e/.backup-download/glou-backup.sql.gz"
# `docker compose` in the documented command then targets the E2E stack.
export COMPOSE_FILE="$root/docker-compose.e2e.yml"

[ -s "$downloaded" ] || { echo "No downloaded backup at $downloaded: run the Playwright suite first."; exit 1; }

# The page's fenced bash block that holds the restore, without its list indent.
restore_block() {
  awk '
    /^ *```bash/ { inside = 1; block = ""; next }
    inside && /^ *```/ { inside = 0; if (block ~ /--single-transaction/) printf "%s", block; next }
    inside { sub(/^   /, ""); block = block $0 "\n" }
  ' "$1"
}
en=$(restore_block "$root/docs/wiki/EN/30-Disaster-Recovery.md")
fr=$(restore_block "$root/docs/wiki/FR/30-Reprise-Apres-Sinistre.md")
[ -n "$en" ] || { echo "No restore command found on the EN page 30."; exit 1; }
if [ "$en" != "$fr" ]; then
  echo "The EN and FR pages 30 document different restore commands:"
  diff <(printf '%s\n' "$en") <(printf '%s\n' "$fr") || true
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf '%s\n' "$en" > "$work/restore.sh"
echo "Documented restore command:"
cat "$work/restore.sh"

# Single statements only: stdin stays closed so `exec` never waits on it.
psql_e2e() { docker compose exec -T db psql -U glou -v ON_ERROR_STOP=1 "$@" </dev/null; }

# Restores $work/glou-backup-XXXX.sql.gz (the page's placeholder name) into a new, empty glou_db.
restore_into_empty_database() {
  echo "::group::Restore $1"
  psql_e2e -d postgres -c 'DROP DATABASE IF EXISTS glou_db' -c 'CREATE DATABASE glou_db'
  (cd "$work" && gunzip -t glou-backup-XXXX.sql.gz && bash restore.sh)
  users=$(psql_e2e -d glou_db -tAc 'SELECT count(*) FROM "User"')
  migrations=$(psql_e2e -d glou_db -tAc 'SELECT count(*) FROM _prisma_migrations')
  echo "Restored $users account(s) and $migrations migration(s)."
  if [ "$users" -lt 1 ] || [ "$migrations" -lt 1 ]; then
    echo "The restored database is empty."
    exit 1
  fi
  echo "::endgroup::"
}

# The check below is only meaningful if this server rejects the setting.
if psql_e2e -d postgres -c 'SET transaction_timeout = 0' >/dev/null 2>&1; then
  echo "This PostgreSQL server accepts transaction_timeout: it is not the PostgreSQL 15 Glou ships."
  exit 1
fi

new_lines=$(gunzip -c "$downloaded" | grep -c '^SET transaction_timeout' || true)
if [ "$new_lines" != 0 ]; then
  echo "The downloaded backup still contains $new_lines SET transaction_timeout line(s)."
  exit 1
fi
cp "$downloaded" "$work/glou-backup-XXXX.sql.gz"
restore_into_empty_database "a backup produced by Glou"

gunzip -c "$downloaded" \
  | awk '!done && /^SET statement_timeout/ { print "SET transaction_timeout = 0;"; done = 1 } { print }' \
  | gzip > "$work/glou-backup-XXXX.sql.gz"
[ "$(gunzip -c "$work/glou-backup-XXXX.sql.gz" | grep -c '^SET transaction_timeout')" = 1 ]
restore_into_empty_database "a backup written before the fix (with SET transaction_timeout)"

echo "The documented restore command restores both backups."

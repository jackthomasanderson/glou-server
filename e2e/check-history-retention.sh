#!/usr/bin/env bash
# #588: the audit-log retention purge keeps the history of bottles and wines.
# A bottle's history and "Restore this value" are read from the audit log;
# the purge (`purgeOldAuditLogs`, run by the scheduled retention cleanup)
# used to delete every row older than `logRetentionDays`, history included.
# Run on a real PostgreSQL, through the API image the E2E stack built: rows
# a year old, then the purge with a retention of one day. The kept rows lose
# their IP address (a security trace, purged like the rest).
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/check-history-retention.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/migration/lib.sh"
database=glou_history_retention_bench

marie=00000000-0000-4000-8000-000000000588
wine=00000000-0000-4000-8000-0000000005f8
bottle=00000000-0000-4000-8000-0000000005b8

echo "::group::Instance at the current schema, with a year-old history"
fresh_database "$database"
migrate_on "$database" >/dev/null
old="now() - interval '400 days'"
psql_on "$database" </dev/null -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"updatedAt\") VALUES
  ('$marie', 'marie', 'marie@example.test', 'x', now())" \
  -c "INSERT INTO \"products\" (\"id\", \"userId\", \"category\", \"name\", \"producer\", \"updatedAt\") VALUES
  ('$wine', '$marie', 'wine', 'Talbot', 'Château Talbot', now())" \
  -c "INSERT INTO \"bottles\" (\"id\", \"userId\", \"productId\", \"quantity\", \"updatedAt\") VALUES
  ('$bottle', '$marie', '$wine', 6, now())" \
  -c "INSERT INTO \"audit_logs\" (\"id\", \"userId\", \"bottleId\", \"productId\", \"action\", \"status\", \"ip\", \"details\", \"createdAt\") VALUES
  (1, '$marie', '$bottle', '$wine', 'UPDATE',        'success', '::1', '{\"changes\":[{\"field\":\"location\",\"from\":\"A\",\"to\":\"B\"}]}', $old),
  (2, '$marie', NULL,      '$wine', 'UPDATE',        'success', '::1', '{\"changes\":[{\"field\":\"region\",\"from\":null,\"to\":\"Médoc\"}]}', $old),
  (3, '$marie', '$bottle', '$wine', 'RESTORE_FIELD', 'success', '::1', '{}', $old),
  (4, '$marie', '$bottle', '$wine', 'MOVE_UNITS',    'success', '::1', '{\"bulk\":true,\"count\":6}', $old),
  (5, '$marie', '$bottle', '$wine', 'GUEST_UPDATE',  'success', '::1', '{}', $old),
  (6, '$marie', NULL,      NULL,    'LOGIN',         'success', '::1', '{}', $old),
  (7, '$marie', '$bottle', '$wine', 'UPDATE',        'error',   '::1', '{}', $old),
  (8, '$marie', NULL,      NULL,    'UPDATE',        'success', '::1', '{\"bulk\":true,\"count\":6}', $old),
  (9, '$marie', NULL,      NULL,    'LOGIN',         'success', '::1', '{}', now()),
  (10, '$marie', '$bottle', '$wine', 'UPDATE',       'success', '::1', '{}', now())"
echo "::endgroup::"

echo "::group::Retention purge, one day"
purged=$(docker compose run --rm --no-deps -T -e DATABASE_URL="${stack_url%/*}/$database" api node -e "
  require('./dist/api/src/services/audit.service.js').purgeOldAuditLogs(1)
    .then((count) => { console.log('purged=' + count); process.exit(0); }, (err) => { console.error(err); process.exit(1); });
" </dev/null | grep '^purged=')
echo "$purged"
echo "::endgroup::"

# The bottle's and the wine's history stay (1-5); the year-old sign-in, the
# failed write and the bulk summary row (no bottle, no wine) go; today's
# sign-in and edit are within the retention.
# Rows kept past the retention have no IP address any more; recent ones keep theirs.
kept=$(psql_on "$database" -tA </dev/null -c "SELECT string_agg(\"id\"::text || ':' || \"ip\", ',' ORDER BY \"id\") FROM \"audit_logs\"")
expected='1:,2:,3:,4:,5:,9:::1,10:::1'
if [ "$purged" != "purged=3" ] || [ "$kept" != "$expected" ]; then
  echo "After the purge: $purged, rows kept $kept (expected purged=3, rows kept $expected)." >&2
  exit 1
fi

docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "The history of bottles and wines survives the retention purge."

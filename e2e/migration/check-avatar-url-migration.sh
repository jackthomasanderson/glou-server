#!/usr/bin/env bash
# #668 migration bench: the avatar migration (`*_relative_avatar_url`) on an
# instance at the previous schema, in the E2E stack's PostgreSQL, through the
# API image the stack built. Avatars uploaded before it were saved as
# http://localhost:3001/uploads/avatars/<file> (or another API_URL): they
# must become /uploads/avatars/<file>, older names included (client extension
# in any case, or none); anything else stays as it was.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-avatar-url-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"
database=glou_avatar_bench

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

avatar=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_relative_avatar_url' -printf '%f\n')
[ -n "$avatar" ] || { echo "No *_relative_avatar_url migration in $migrations." >&2; exit 1; }
migrations_before "$work/before" "$avatar"

echo "::group::Instance at the schema before $avatar"
fresh_database "$database"
migrate_on "$database" -v "$work/before:/app/prisma/migrations:ro" >/dev/null
psql_on "$database" </dev/null -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"updatedAt\", \"avatarUrl\") VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'local',    'a1@example.test', 'x', now(), 'http://localhost:3001/uploads/avatars/0b7c1f9e-4a2d-4c3b-8e6f-1a2b3c4d5e6f.jpg'),
  ('00000000-0000-4000-8000-0000000000a2', 'apiurl',   'a2@example.test', 'x', now(), 'https://glou.example.org/uploads/avatars/1c8d2a0f-5b3e-4d4c-9f70-2b3c4d5e6f70.webp'),
  ('00000000-0000-4000-8000-0000000000a3', 'relative', 'a3@example.test', 'x', now(), '/uploads/avatars/2d9e3b10-6c4f-4e5d-8a81-3c4d5e6f7081.png'),
  ('00000000-0000-4000-8000-0000000000a4', 'external', 'a4@example.test', 'x', now(), 'https://cdn.example.com/people/me.png'),
  ('00000000-0000-4000-8000-0000000000a5', 'nested',   'a5@example.test', 'x', now(), 'https://cdn.example.com/uploads/avatars/team/me.png'),
  ('00000000-0000-4000-8000-0000000000a6', 'none',     'a6@example.test', 'x', now(), NULL),
  ('00000000-0000-4000-8000-0000000000a7', 'upper',    'a7@example.test', 'x', now(), 'http://localhost:3001/uploads/avatars/00000000-0000-4000-8000-0000000000a7-1722700000000.JPG'),
  ('00000000-0000-4000-8000-0000000000a8', 'noext',    'a8@example.test', 'x', now(), 'http://localhost:3001/uploads/avatars/00000000-0000-4000-8000-0000000000a8-1722700000000')"
echo "::endgroup::"

echo "::group::Update: every migration left, $avatar included"
migrate_on "$database"
echo "::endgroup::"

expected="local|/uploads/avatars/0b7c1f9e-4a2d-4c3b-8e6f-1a2b3c4d5e6f.jpg
apiurl|/uploads/avatars/1c8d2a0f-5b3e-4d4c-9f70-2b3c4d5e6f70.webp
relative|/uploads/avatars/2d9e3b10-6c4f-4e5d-8a81-3c4d5e6f7081.png
external|https://cdn.example.com/people/me.png
nested|https://cdn.example.com/uploads/avatars/team/me.png
none|
upper|/uploads/avatars/00000000-0000-4000-8000-0000000000a7-1722700000000.JPG
noext|/uploads/avatars/00000000-0000-4000-8000-0000000000a8-1722700000000"
actual=$(psql_on "$database" -tA </dev/null -c "SELECT \"username\" || '|' || coalesce(\"avatarUrl\", '') FROM \"User\" ORDER BY \"id\"")
if [ "$actual" != "$expected" ]; then
  echo "Avatar addresses after the migration:"
  diff <(echo "$expected") <(echo "$actual") || true
  exit 1
fi
docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "Uploaded avatars are relative, every other address untouched."

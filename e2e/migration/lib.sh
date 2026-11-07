# Shared helpers of the migration benches (e2e/migration/check-*.sh), sourced
# by them. They run against the E2E stack (docker-compose.e2e.yml): same
# PostgreSQL server and credentials, other databases, and the API image's own
# `prisma migrate deploy`.
#
# Sets: root (repository), migrations (the shipped migrations folder),
# COMPOSE_FILE, stack_url (the stack's DATABASE_URL).

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export COMPOSE_FILE="$root/docker-compose.e2e.yml"
migrations="$root/api/prisma/migrations"

# Same server and credentials as the stack, other databases.
stack_url=$(docker compose exec -T api printenv DATABASE_URL </dev/null)

# Single statements or a file on stdin; stops at the first SQL error.
psql_on() { local db=$1; shift; docker compose exec -T db psql -U glou -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }

# `prisma migrate deploy` on database $1; the other arguments go to
# `docker compose run` (e.g. -v <folder>:/app/prisma/migrations:ro to apply a
# subset). stdin closed: `run`/`exec` would otherwise wait on it.
migrate_on() {
  local db=$1; shift
  docker compose run --rm --no-deps -T -e DATABASE_URL="${stack_url%/*}/$db" "$@" api npx prisma migrate deploy </dev/null
}

# Drops and recreates database $1, empty.
fresh_database() {
  docker compose exec -T db psql -U glou -d postgres -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" </dev/null
}

# A copy of the migrations folder in $1, holding only the migrations whose
# folder name compares to $2 with $3 (`<`: strictly before it, `<=`: up to
# and including it).
migrations_copy() {
  local dir name
  mkdir "$1"
  cp "$migrations/migration_lock.toml" "$1/"
  for dir in "$migrations"/*/; do
    name=$(basename "$dir")
    if [[ "$name" < "$2" ]] || { [ "$3" = '<=' ] && [ "$name" = "$2" ]; }; then
      cp -r "$dir" "$1/$name"
    fi
  done
  # Read by the API image's user (uid 1001).
  chmod -R a+rX "$1"
}
# The migrations before $2 (excluded), in $1.
migrations_before() { migrations_copy "$1" "$2" '<'; }
# The migrations up to and including $2, in $1.
migrations_through() { migrations_copy "$1" "$2" '<='; }

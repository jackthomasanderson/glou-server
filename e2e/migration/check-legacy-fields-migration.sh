#!/usr/bin/env bash
# #468 migration bench: the `*_humidor_source_manual_only` and
# `*_legacy_collection_label` migrations on an instance at the previous
# schema, in the E2E stack's PostgreSQL, through the API image the stack
# built.
# - A humidor reading stored with the `sensor` source stays, as a manual one.
# - Each wine's free-text collection label becomes real collections: a label
#   merged as "A / B" gives two, a known name (case and spaces aside) is
#   joined, a blank label gives none. A label over 100 characters is cut
#   (never ending on a space) and written in full in the wine's notes. The
#   column is then gone.
#
# Usage, with the E2E stack up (docker-compose.e2e.yml):
#   bash e2e/migration/check-legacy-fields-migration.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
source "$here/lib.sh"
database=glou_legacy_fields_bench

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod a+rX "$work"

target=$(find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_humidor_source_manual_only' -printf '%f\n')
[ -n "$target" ] || { echo "No *_humidor_source_manual_only migration in $migrations." >&2; exit 1; }
find "$migrations" -mindepth 1 -maxdepth 1 -type d -name '*_legacy_collection_label' | grep -q . \
  || { echo "No *_legacy_collection_label migration in $migrations." >&2; exit 1; }
migrations_before "$work/before" "$target"

echo "::group::Instance at the schema before $target"
fresh_database "$database"
migrate_on "$database" -v "$work/before:/app/prisma/migrations:ro" >/dev/null
psql_on "$database" </dev/null \
  -c "INSERT INTO \"User\" (\"id\", \"username\", \"email\", \"passwordHash\", \"updatedAt\") VALUES ('00000000-0000-4000-8000-000000000468', 'm', 'm@example.test', 'x', now())" \
  -c "INSERT INTO \"cellars\" (\"id\", \"name\", \"userId\", \"updatedAt\") VALUES ('c1', 'Humidor', '00000000-0000-4000-8000-000000000468', now())" \
  -c "INSERT INTO \"humidor_readings\" (\"id\", \"cellarId\", \"userId\", \"humidityPercent\", \"source\") VALUES
        ('r1', 'c1', '00000000-0000-4000-8000-000000000468', 68, 'sensor'),
        ('r2', 'c1', '00000000-0000-4000-8000-000000000468', 70, 'manual')" \
  -c "INSERT INTO \"collections\" (\"id\", \"name\", \"userId\", \"createdAt\", \"updatedAt\") VALUES ('k-noel', 'Noël', NULL, '2025-01-01', now())" \
  -c "INSERT INTO \"products\" (\"id\", \"userId\", \"category\", \"name\", \"producer\", \"collection\", \"createdAt\", \"updatedAt\") VALUES
        ('p1', '00000000-0000-4000-8000-000000000468', 'wine', 'p1', 'P', ' noël ',         '2025-02-01', now()),
        ('p2', '00000000-0000-4000-8000-000000000468', 'wine', 'p2', 'P', 'Fête / Mariage', '2025-03-01', now()),
        ('p3', '00000000-0000-4000-8000-000000000468', 'wine', 'p3', 'P', 'fête',           '2025-04-01', now()),
        ('p4', '00000000-0000-4000-8000-000000000468', 'wine', 'p4', 'P', NULL,             '2025-05-01', now()),
        ('p5', '00000000-0000-4000-8000-000000000468', 'wine', 'p5', 'P', '  ',             '2025-06-01', now())" \
  -c "INSERT INTO \"products\" (\"id\", \"userId\", \"category\", \"name\", \"producer\", \"collection\", \"notes\", \"createdAt\", \"updatedAt\") VALUES
        ('p6', '00000000-0000-4000-8000-000000000468', 'wine', 'p6', 'P', repeat('a', 99) || ' bbbbb', NULL,       '2025-07-01', now()),
        ('p7', '00000000-0000-4000-8000-000000000468', 'wine', 'p7', 'P', repeat('c', 150),            'Old note', '2025-08-01', now()),
        ('p8', '00000000-0000-4000-8000-000000000468', 'wine', 'p8', 'P', repeat('d', 150),
         'Libellés d''origine : ' || repeat('d', 150) || ' / ' || repeat('e', 80),                            '2025-09-01', now())" \
  -c "INSERT INTO \"_CollectionProducts\" (\"A\", \"B\") VALUES ('k-noel', 'p1')"
echo "::endgroup::"

echo "::group::Update: every migration left, both #468 migrations included"
migrate_on "$database"
echo "::endgroup::"

readings=$(psql_on "$database" -tA </dev/null -c "SELECT string_agg(\"id\" || '|' || \"source\"::text, ' ' ORDER BY \"id\") FROM \"humidor_readings\"")
[ "$readings" = "r1|manual r2|manual" ] || { echo "Humidor readings after the migration: $readings" >&2; exit 1; }

expected="Fête|p2,p3
Mariage|p2
Noël|p1"
actual=$(psql_on "$database" -tA </dev/null -c "SELECT c.\"name\" || '|' || coalesce(string_agg(cp.\"B\", ',' ORDER BY cp.\"B\"), '')
  FROM \"collections\" c LEFT JOIN \"_CollectionProducts\" cp ON cp.\"A\" = c.\"id\" WHERE length(c.\"name\") < 50 GROUP BY c.\"name\" ORDER BY c.\"name\"")
if [ "$actual" != "$expected" ]; then
  echo "Collections after the migration:"
  diff <(echo "$expected") <(echo "$actual") || true
  exit 1
fi
# Long labels: cut at 100 characters without a trailing space, linked, and
# kept in full in the notes.
long=$(psql_on "$database" -tA </dev/null -c "SELECT string_agg(cp.\"B\" || '|' || length(c.\"name\") || '|' || (c.\"name\" = btrim(c.\"name\"))::text, ' ' ORDER BY cp.\"B\")
  FROM \"collections\" c JOIN \"_CollectionProducts\" cp ON cp.\"A\" = c.\"id\" WHERE length(c.\"name\") >= 50")
[ "$long" = "p6|99|true p7|100|true p8|100|true" ] || { echo "Long labels after the migration: $long" >&2; exit 1; }
notes=$(psql_on "$database" -tA </dev/null -c "SELECT string_agg(\"id\" || '|' || (\"notes\" LIKE '%Libellés d''origine : ' || CASE \"id\" WHEN 'p6' THEN repeat('a', 99) || ' bbbbb' ELSE repeat('c', 150) END)::text
  || '|' || (\"id\" <> 'p7' OR \"notes\" LIKE 'Old note' || E'\n\n' || '%')::text, ' ' ORDER BY \"id\") FROM \"products\" WHERE \"id\" IN ('p6', 'p7')")
[ "$notes" = "p6|true|true p7|true|true" ] || { echo "Notes of the long labels after the migration: $notes" >&2; exit 1; }
# A wine merged by the families migration already holds its full labels in its
# notes: they are not written a second time.
merged=$(psql_on "$database" -tA </dev/null -c "SELECT (length(\"notes\") - length(replace(\"notes\", 'Libellés d''origine', ''))) / length('Libellés d''origine') FROM \"products\" WHERE \"id\" = 'p8'")
[ "$merged" = "1" ] || { echo "Original-label lines in the notes of a merged wine: $merged" >&2; exit 1; }
column=$(psql_on "$database" -tA </dev/null -c "SELECT count(*) FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'collection'")
[ "$column" = "0" ] || { echo "products.collection is still there." >&2; exit 1; }

docker compose exec -T db psql -U glou -d postgres -q -c "DROP DATABASE $database" </dev/null
echo "Sensor readings kept as manual ones; every legacy label is now a real collection."

#!/usr/bin/env bash
# Restores only to an EMPTY, isolated loopback *_test database. Never drops anything.
set -euo pipefail
: "${SOURCE_DB:?Set SOURCE_DB to an isolated test database URL}"
: "${RESTORE_DB:?Set RESTORE_DB to a different EMPTY isolated test database URL}"
node - <<'JS'
const source=new URL(process.env.SOURCE_DB),target=new URL(process.env.RESTORE_DB);
for(const u of [source,target])if(!['127.0.0.1','localhost'].includes(u.hostname)||!u.pathname.endsWith('_test'))throw Error('This automated drill accepts local *_test databases ONLY.');
if(source.href===target.href)throw Error('Source and restore target must differ');
JS
count=$(psql "$RESTORE_DB" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_tables where schemaname='public'")
[[ "$count" == 0 ]] || { echo 'Restore target must be empty; nothing was changed.' >&2; exit 1; }
backup=$(mktemp)
trap 'rm -f "$backup"' EXIT
chmod 600 "$backup"
pg_dump "$SOURCE_DB" -Fc --no-owner --no-acl --file "$backup"
pg_restore --dbname "$RESTORE_DB" --no-owner --no-acl --exit-on-error "$backup"
for table in users orders service_bookings schema_migrations; do
 before=$(psql "$SOURCE_DB" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from public.$table")
 after=$(psql "$RESTORE_DB" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from public.$table")
 [[ "$before" == "$after" ]] || { echo "Count mismatch: $table" >&2; exit 1; }
 echo "Restored $table: $after rows"
done
psql "$RESTORE_DB" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_constraint where conname='service_bookings_no_overlap'" | grep -qx 1
psql "$RESTORE_DB" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_trigger where tgname='users_invalidate_sessions'" | grep -qx 1
echo 'Isolated database restore drill passed (row counts + critical constraints/triggers). Storage objects and production backups are NOT covered by this test.'

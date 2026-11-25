#!/usr/bin/env bash
# Validate Alembic migrations and run the backend suite against a real, disposable PostgreSQL.
# Used by CI (.github/workflows/ci.yml) and locally. Usage, from backend/:
#   scripts/validate_migrations.sh postgresql://user:pass@host:5432/agrisense_test
# Safety: refuses any database whose name does not contain "test" (the tests TRUNCATE tables).
set -euo pipefail
URL="${1:?usage: validate_migrations.sh <postgresql-url-of-a-disposable-test-database>}"
DB_NAME="$(python -c 'import sys; from sqlalchemy.engine import make_url; print(make_url(sys.argv[1]).database or "")' "$URL")"
case "$DB_NAME" in
  *test*) ;;
  *) echo "Refusing: database name '$DB_NAME' does not contain 'test'." >&2; exit 2 ;;
esac
step() { echo; echo "::group::$1"; }
end() { echo "::endgroup::"; }
# Database variables are passed per command (not exported) so they can't leak into the test run.
db() { DATABASE_URL="$URL" DATABASE_MIGRATION_URL="$URL" "$@"; }

step "alembic upgrade head (empty database)";   db python -m alembic upgrade head;   end
step "alembic check (models match migrations)"; db python -m alembic check;         end
step "alembic downgrade base (reversibility)";  db python -m alembic downgrade base; end
step "alembic upgrade head (again)";            db python -m alembic upgrade head;   end
step "connection / PostGIS / revision report";  db python -m app.check_db || true;   end
step "pytest on PostgreSQL (RLS guard included)"
env -u DATABASE_URL -u DATABASE_MIGRATION_URL TEST_DATABASE_URL="$URL" python -m pytest -q -p no:cacheprovider -rs
end
echo "Migration validation passed."

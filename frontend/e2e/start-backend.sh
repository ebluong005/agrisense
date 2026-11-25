#!/bin/bash
# Throwaway backend for browser tests: fresh SQLite DB, fake NASA POWER, API on :8100.
# Never touches backend/.env's database: DATABASE_URL is overridden below.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$HERE/../../backend"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/agrisense-e2e.XXXXXX")"  # portable: macOS + Linux
"$BACKEND/.venv/bin/python" "$HERE/fake_nasa.py" 8101 &
NASA=$!
trap 'kill $NASA 2>/dev/null; rm -rf "$TMP"' EXIT
export APP_ENV=test DATABASE_URL="sqlite:///$TMP/e2e.db" NASA_POWER_URL="http://127.0.0.1:8101/api/temporal/daily/point"
cd "$BACKEND"
.venv/bin/python -m alembic upgrade head >/dev/null 2>&1
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100

# AgriSense — Native Development and Deployment Guide

**No Docker or container setup required.** Sections 2–3 describe the implemented setup; sections 4+ are still the target plan. Do not run production migrations until verified in staging.

## 1. Accounts and prerequisites

- macOS Apple Silicon ARM64; Python 3.12+; Node.js 22 LTS or an actively supported Node LTS compatible with the project; npm; Git.
- Create separate Supabase **development** and **production** projects (add staging where feasible). Enable PostGIS through the Supabase SQL editor.
- Connect GitHub repository to Vercel and Render. Render native Python runtime, not Docker-based services.
- Set minimum budgets and usage alerts with providers; low-cost product requires predictable infrastructure cost.

## 2. Local development (implemented)

The commands in the root [README](../README.md) are the source of truth. Summary:

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
python -m alembic upgrade head
python -m app.check_db
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm ci
npm run dev      # Vite on :5173 proxies /api to :8000
```

**How configuration works** (`backend/app/config.py`, `backend/app/database.py`):

| Variable | Purpose |
|---|---|
| `APP_ENV` | `local` (default), `test`, `staging`, `production`. In `staging`/`production` the app refuses to start with the default or a short (<32 char) `JWT_SECRET`, or with SQLite. |
| `DATABASE_URL` | Runtime database. Defaults to local SQLite (`./agrisense.db`, no PostGIS). Supabase's `postgresql://` URLs are rewritten to the `postgresql+psycopg://` driver automatically. |
| `DATABASE_MIGRATION_URL` | Optional URL used only by Alembic (direct connection or session pooler). Defaults to `DATABASE_URL`. |
| `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` | Per-process pool (defaults 5 + 2). Keep them low: Supabase limits total connections. |

If the URL uses port **6543** (Supabase transaction pooler), psycopg prepared statements are disabled automatically, because the pooler does not support them. The pool uses `pool_pre_ping` and recycles connections every 30 minutes.

**Schema ownership:** only Alembic creates or changes tables. The API never calls `create_all()`. `alembic/versions/0001_initial.py` contains explicit operations, and a test fails if models and migrations drift apart.

## 3. Supabase setup

A **dev** project is provisioned. These steps were run against it on 2026-11-24 and pass (PostgreSQL 17.12, PostGIS 3.3.7 in schema `extensions`).

> **IPv6 note:** the direct host `db.<project-ref>.supabase.co` publishes only an IPv6 address. On IPv4-only networks it fails with a DNS / "could not translate host name" error. Use the **Session pooler** URI instead: user `postgres.<project-ref>`, host `aws-0-<region>.pooler.supabase.com`, port `5432`. It works for both the API and Alembic.

> **Data API exposure:** Supabase serves every `public` table through its REST/GraphQL Data API, using the browser-visible publishable key. Migration `0002_enable_rls` enables RLS (no policies) and revokes `anon`/`authenticated` privileges on all app tables. Every new table needs the same treatment; `test_every_table_has_rls_and_no_data_api_access` enforces it in PostgreSQL test mode. Verify with: `curl "$SUPABASE_URL/rest/v1/users?select=*" -H "apikey: <publishable key>"`, which should return `42501 permission denied`.

1. Create a Supabase project named e.g. `agrisense-dev` (keep production separate later). Store the database password in a password manager.
2. Enable PostGIS: Dashboard → Database → Extensions → `postgis`, or in the SQL editor:
   ```sql
   CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
   SELECT extname, extversion, extnamespace::regnamespace FROM pg_extension WHERE extname = 'postgis';
   ```
   The current schema does not use geometry columns yet. PostGIS is required for the planned field-geometry migration, and `check_db` reports it as missing until it is enabled.
3. Dashboard → **Connect**: copy the **Session pooler** URI (works on IPv4 networks) into `backend/.env` as `DATABASE_URL`, append `?sslmode=require` if absent, and URL-encode special characters in the password. If your network has IPv6, the **direct** connection can be used for `DATABASE_MIGRATION_URL`.
4. Run, from `backend/`:
   ```bash
   python -m app.check_db          # expect: Connection OK, PostGIS <version>, current=none
   python -m alembic upgrade head
   python -m alembic check         # expect: No new upgrade operations detected
   python -m app.check_db          # expect exit code 0
   ```
   `check_db` prints the URL with the password replaced by `***`. Do not paste the raw URL into issues or chat.
5. Start the API and confirm `GET /ready` returns `{"status":"ready"}`, then register a user, create a farm, restart the API and confirm the farm is still there.
6. For integration tests, create a separate database such as `agrisense_test` (its name must contain `test`) and set `TEST_DATABASE_URL`. Never point it at a database with real data: tests truncate every table.
7. Create a least-privileged runtime role before staging/production (planned; the dev project may use the default `postgres` user).

## 4–6. Vercel, Render, pipeline and rollback

Implemented as code. See **[CICD_DESIGN.md](CICD_DESIGN.md)** for:
- the one-time setup of GitHub Environments, Render (Blueprint `render.yaml`, native Python, auto-deploy off) and Vercel (CLI deploys from `frontend/`, Git deployments off);
- the secrets list;
- the release procedure, with approval-gated production migrations;
- failure handling and rollback.

Manual equivalents for a first deploy or an emergency:
- **Backend start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (Render, root `backend`).
- **Migrations:** `DATABASE_URL=<migration URL> python -m alembic upgrade head`, from `backend/`. Staging freely; production only with a backup and an approval.
- **Smoke test:** `python3 scripts/smoke_test.py --api <api origin> --web <frontend url>`. Add `--write-checks` plus `SMOKE_EMAIL`/`SMOKE_PASSWORD` for staging.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Alembic `script_location` absent | `backend/alembic.ini`, correct working directory, `[alembic]` section |
| Cannot reach Supabase | host/port, password URL escaping, SSL, IP family and connection mode |
| `relation ... does not exist` / `no such table` | run `python -m alembic upgrade head` against the same `DATABASE_URL`; `python -m app.check_db` shows current vs head |
| `/ready` returns 503 | DB unreachable: run `python -m app.check_db` for a redacted diagnosis |
| `prepared statement ... does not exist` | using port 6543 without the app's engine settings (e.g. a custom script); use `app.database.build_engine` or the session pooler |
| App refuses to start: `JWT_SECRET must be set` | `APP_ENV` is staging/production and the secret is default or < 32 chars |
| CORS blocked | backend exact allowed Vercel preview/production origin; credentials setting |
| Frontend points at localhost after deploy | rebuild with production `VITE_API_BASE_URL` |
| 401/403 from field API | auth/session validity and server ownership check |
| NASA upstream unavailable | timeouts, rate limits, cache freshness and observable fallback |
| No PostGIS features | extension enabled; geometry schema and migration/driver support |

## Official references

- [Render FastAPI deployment](https://render.com/docs/deploy-fastapi)
- [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)

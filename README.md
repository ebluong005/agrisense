# AgriSense

Low-cost, mobile-first weather and field monitoring for small and resource-constrained farmers.
FastAPI + SQLAlchemy/Alembic backend, React + TypeScript + Vite frontend, Supabase PostgreSQL/PostGIS target.
**No Docker:** everything runs natively (developed on macOS ARM64).

> Status: pilot MVP in development. See [docs/CURRENT_STATE_AUDIT.md](docs/CURRENT_STATE_AUDIT.md) for
> what is implemented versus planned. The design pack in `docs/` describes the target, not current behavior.

## Prerequisites

- Python 3.12+ (`python3.12 --version`; on macOS: `brew install python@3.12`)
- Node.js 20+ and npm
- Optional for now: a Supabase **development** project (see [Supabase setup](docs/DEPLOYMENT_GUIDE.md#3-supabase-setup))

## Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env              # defaults to local SQLite; edit DATABASE_URL for Supabase
python -m alembic upgrade head    # the schema is created by migrations only
python -m app.check_db            # connection, PostGIS and migration status (passwords redacted)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API docs: http://127.0.0.1:8000/docs
- Liveness: `GET /health` · Readiness (DB reachable): `GET /ready`

The API no longer creates tables on startup. If you see `no such table` or
`relation ... does not exist`, run `python -m alembic upgrade head` against the same `DATABASE_URL`.

### Quality checks

```bash
cd backend
python -m ruff check .            # lint
python -m ruff format --check .   # formatting
python -m pytest -q               # unit + API tests on in-memory SQLite (no network)
```

Integration mode runs the same tests on **real PostgreSQL**, with the schema built by Alembic.
Use an isolated, disposable database whose name contains `test`. Tables are truncated between tests.

```bash
TEST_DATABASE_URL='postgresql://...agrisense_test...' python -m pytest -q
```

## Frontend

Requires **Node 22** (`frontend/.nvmrc`; with nvm: `cd frontend && nvm use`). Node 20 is end-of-life and too old for the toolchain.

```bash
cd frontend
nvm use           # Node 22
npm ci            # installs exactly what package-lock.json pins
cp .env.example .env.local   # optional locally; VITE_API_BASE_URL empty = use the dev proxy
npm run dev       # http://127.0.0.1:5173, proxies /api to http://127.0.0.1:8000 (start the backend first)
```

| Script | What it checks |
|---|---|
| `npm run lint` | ESLint: TypeScript, React hooks, accessibility (`jsx-a11y`) |
| `npm run typecheck` | `tsc --noEmit`, strict mode |
| `npm test` | Vitest + Testing Library (jsdom; maps are stubbed) |
| `npm run build` | typecheck + production build into `dist/` |
| `npm run test:e2e` | Playwright: real drawing gestures and weather flows in Chromium (desktop + phone viewport) |

**Browser tests** (`frontend/e2e`) start their own servers on ports 5180/8100: a throwaway SQLite backend and
`e2e/fake_nasa.py`, a deterministic stand-in for NASA POWER. They never touch your `.env` database or the internet,
except map tiles. One-time setup: `npx playwright install chromium`.

**Structure** (`frontend/src`):

```
api/          typed endpoint functions + HTTP client (auth header, timeouts, friendly errors). No UI.
auth/         session context and route guards
hooks/        useApi (loading/error/abort), useAction (mutations), useGeolocation
components/   ui/ (Button, TextField, Notice, states, ConfirmDialog...), map/ (Leaflet), layout/ (AppShell + nav)
features/     screens: auth, farms (list, dashboard, weather, alerts), fields (boundary editor), account
lib/          pure helpers: units (acres/inches/°F), geometry, dates, weather summary
```

Pages never call `fetch` directly. They use `api/endpoints.ts` through `useApi` and `useAction`.
Map screens and the rainfall chart are lazy-loaded to keep the first download small (~106 KB gzipped JS).

**Deploying on Vercel:** root directory `frontend`, framework Vite, set `VITE_API_BASE_URL` to the API origin.
`vercel.json` rewrites all paths to `index.html` so deep links work.

## CI/CD

GitHub Actions in `.github/workflows/`:
- every PR runs backend, migration (real PostgreSQL 17 + PostGIS), frontend, browser and dependency checks;
- merges deploy to staging automatically;
- production needs an approval.

No Docker. Setup, secrets, failure handling and rollback: [docs/CICD_DESIGN.md](docs/CICD_DESIGN.md).

## Repository layout

```
backend/
  app/            FastAPI app: config, database, auth, models, schemas, weather (NASA POWER),
                  geometry (field validation/area), satellite (optional NDVI), check_db CLI
  alembic/        migrations (explicit operations; never create_all)
  tests/          pytest suite (SQLite by default, PostgreSQL via TEST_DATABASE_URL)
frontend/         React + Vite app (Leaflet map, Recharts dashboard)
docs/             system, database, API, CI/CD, deployment design + audit
```

## Data sources and limitations

- [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/): gridded, modelled daily weather, **not** an on-field sensor reading.
- Copernicus Sentinel-2 NDVI (optional, P1): disabled until credentials are configured; returns 503 rather than fabricated data.
- Low-rainfall flags are investigation prompts, not drought, disease or irrigation diagnoses.
- This is not a security-audited production service yet: no rate limiting, password reset or email verification.

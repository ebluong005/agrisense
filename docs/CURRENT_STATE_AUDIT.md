# AgriSense — Current-State Audit (Day 1 / AG-001)

> **Update 2026-11-24 (baseline task):** the repository now lives in `~/AgriSenseMVP` (git initialised, nothing committed yet). Items 1–4, 6 and 9 (Ruff) of §4 are resolved; see §6. Sections 1–5 below are the original audit, kept for history.

**Date:** 2026-11-24  
**Method:** files read in full; tests, migrations and builds run in a throwaway copy. Nothing in the source folders was changed.

## 1. Where the code actually is

| Location | Contents | Git | Verdict |
|---|---|---|---|
| `~/AgriSenseMVP` (this folder) | Design docs only: `docs/*.md`, `REQUIRMENTS.txt` (spelled this way), `SW_DEVELOPMENT_PLAN.txt`, `SYSTEM_ARCHITECTURE.drawio`. **No backend or frontend code.** | No | Design pack |
| `~/agrisense` | Hand-written weather-only FastAPI (`backend/main.py`, `schemas.py`, `weather_service.py`), a broken Alembic scaffold, `docker-compose.yml`. `frontend/` is empty. | No | Early prototype |
| `~/Downloads/agrisense-mvp` | Generated full-stack MVP: FastAPI app package, React/Leaflet/Recharts frontend, tests, Alembic, Docker files. | No | **Most complete; recommended baseline** |

The generated MVP covers everything the `~/agrisense` prototype does. Both have the same NASA POWER parsing logic.

## 2. Verified results (commands actually run)

| Check | Result |
|---|---|
| NASA POWER live request (Tucson, 2026-11-01..07, `T2M,PRECTOTCORR`) | ✅ Real data returned; fill value `-999.0` |
| MVP `pytest -q` (Python 3.12.16, in-memory SQLite) | ✅ 4 passed |
| MVP `alembic upgrade head` + `alembic check` (SQLite) | ✅ ran, no drift, but see §4 |
| MVP frontend `npm install` | ❌ **ERESOLVE**: `react-leaflet-draw@0.21.0` needs React 19; app is on React 18 and never imports that package |
| MVP frontend `npm run build` (after `--legacy-peer-deps`) | ✅ builds; JS bundle **784 KB (220 KB gzip)** |
| `~/agrisense` `alembic/env.py` | ❌ would crash: `config` used before it is assigned; imports `database`/`models` modules that don't exist; then sets `target_metadata = None`; no SQLAlchemy/Alembic in `requirements.txt` |
| Postgres/PostGIS, Supabase, CI, deploys | ⛔ Not tested: none exists yet |

## 3. Implemented vs planned (generated MVP)

| Requirement | Status | Notes |
|---|---|---|
| R-001 register/login/me | **Implemented, tested** | JWT bearer in `localStorage`; scrypt hashing; no logout endpoint, no rate limiting, no export/delete-account |
| Owner isolation (AC-03) | **Implemented, tested** | 404 for other users' farms/fields |
| R-002 farm CRUD | **Implemented** | `PUT` instead of the design's `PATCH`; no pagination; integer IDs (design says UUID) |
| R-002 field polygon | **Partial** | Shapely validation + geodesic area ✅; stored as **JSON, not PostGIS geometry**; no point fallback; no UI field edit |
| R-003 weather | **Partial** | Real NASA data ✅; cache is one JSON blob per exact (lat, lon, start, end) with 24 h TTL; no `retrieved_at`/`stale`/completeness in response; no retries |
| R-005 dashboard | **Partial** | Works, but the **frontend counts missing rainfall as 0 mm** (`r.precipitation_mm||0`), which the requirements forbid |
| R-006 alerts | **Partial** | 7-day low-rainfall rule computed on request; `alerts` table never written to |
| R-004 NDVI | **Code exists, never run against a live account** | 503 without credentials (tested); `ndvi_observations` table unused. P1, keep disabled |
| R-101 USDM | Not started | P1 |
| CI/CD, Supabase, Vercel, Render | Not started | |

## 4. Defects and technical debt, by priority

**Blocks the next steps**
1. **No repository.** Nothing is under git, so CI, Vercel and Render cannot be connected.
2. **Docker dependency.** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `infra/postgres/` and the README quick-start all assume Docker (against ADR-001). `.env.example` points at the Docker DB on port 5433.
3. **Fresh `npm install` fails** (unused `react-leaflet-draw`). There is no `package-lock.json`, so `npm ci` in CI is impossible.
4. **The migration isn't a real migration.** `0001_initial.py` calls `Base.metadata.create_all()`, so whatever the models look like *today* gets created. Once the models change, migration history no longer matches the schema. The app also runs `create_all()` on startup, which bypasses Alembic.

**Correctness and trust**
5. Missing rainfall is shown as zero in the dashboard totals.
6. `JWT_SECRET` silently falls back to `CHANGE_ME_LOCAL_DEVELOPMENT_ONLY` when it isn't set. It should fail fast outside local dev.
7. Async weather routes use a sync SQLAlchemy session and keep it open while waiting on NASA (SYSTEM_DESIGN §3 warns against this). A new HTTPX client is created per request.

**Gaps against the design (planned work, not bugs)**
8. Field geometry is JSON. PostGIS `geometry(MultiPolygon,4326)` plus a GiST index is Day 2/4 work.
9. No Ruff, lint, typecheck or Vitest scripts. Styling is hand-written CSS, not Tailwind. `planting_date` is stored as a string.
10. The 784 KB bundle is heavy for low-bandwidth users. Code-split the map and charts later (R-007).

## 5. Recommended next task: AG-001 "Repository baseline, Docker-free"

Small, testable, and it unblocks everything else:
1. `git init` a single repo (this folder: docs plus the MVP's `backend/` and `frontend/`), with `.gitignore` verified so no `.env` or `.db` files are tracked.
2. Remove the Docker artifacts and rewrite the README quick-start for a native venv and npm setup.
3. Drop `react-leaflet-draw`, then commit `package-lock.json`.
4. Add `requirements-dev.txt` entries for Ruff, plus a `ruff check` that passes.
5. Remove `create_all()` from app startup. Make the JWT secret required unless `ENV=local`.
6. Fix the zero-rain display so missing days show as missing.

**Acceptance:** `pytest` green, `ruff check` green, `npm ci && npm run build` green, `/health` and a real weather request work on a native local run.

**Then Day 2 (AG-002):** replace `0001_initial` with an explicit migration against a Supabase dev project with PostGIS (needs the user's Supabase dev connection string).

## 6. Baseline task results (2026-11-24)

**Done**
- MVP `backend/` and `frontend/` copied into this repo **without** Docker files (`docker-compose.yml`, Dockerfiles, `nginx.conf`, `infra/`). Originals in `~/Downloads/agrisense-mvp` and `~/agrisense` untouched.
- Config: `APP_ENV`; Supabase `postgresql://` URL normalisation; optional `DATABASE_MIGRATION_URL`; small pool with pre-ping; prepared statements disabled on port 6543; JWT secret and non-SQLite enforced in staging/production.
- Alembic: `0001_initial` rewritten as explicit operations (same revision ID, identical schema); `alembic.ini` logging fixed; `create_all()` removed from app startup.
- `GET /ready` (503 when DB is down) and `python -m app.check_db` (redacted URL, server version, PostGIS, migration current vs head).
- Tests 4 → 23: mocked NASA POWER parsing/fill values/cache/upstream errors, config validation, readiness, migration drift + downgrade. Optional PostgreSQL mode via `TEST_DATABASE_URL`.
- Ruff lint + format (whole backend reformatted mechanically; behaviour covered by tests).
- Frontend: removed unused `react-leaflet` and `react-leaflet-draw`; `package-lock.json` added; `npm ci` works. Production bundle byte-identical to before.

**Verified**

| Check | Result |
|---|---|
| `pytest -q` (SQLite) | 23 passed |
| `pytest -q` with `TEST_DATABASE_URL` on PostgreSQL 16.2 (native arm64, throwaway `pgserver` instance) | 23 passed |
| Alembic upgrade → check → downgrade → upgrade on PostgreSQL 16.2 and SQLite | all OK, no drift |
| `ruff check .` / `ruff format --check .` | clean |
| Native `uvicorn` run: `/health`, `/ready`, register, **live** NASA POWER weather via API | OK; values match direct NASA call |
| `npm ci && npm run build` | OK |

**Supabase dev (verified 2026-11-24):** connected via session pooler (direct host is IPv6-only); PostGIS 3.3.7 detected; migrations `0001_initial` + `0002_enable_rls` applied, `alembic check` clean; Data API returns `42501 permission denied` for app tables; farm persisted across an API restart; live NASA weather cached in Supabase. Test data removed afterwards.

**Not verified:** transaction pooler (port 6543) behaviour; geometry columns (none yet).

**Still open from §4:** 5 (zero-rain display, frontend; out of scope for this task), 7 (sync session in async routes), 8 (PostGIS geometry), the rest of 9, and 10.

## 7. Frontend rebuild (2026-11-24)

The single-file generated UI was replaced with a structured React 19 + TypeScript + Vite 8 + Tailwind 4 app (React Router 8, Leaflet, Recharts 3).

- **Screens:** login, register, farm list, farm create/edit/delete, farm dashboard (warnings, 30-day weather, field map and list), field create/edit/delete, account.
- **Boundary editing:** an in-house tap-to-place-corners editor replaced `leaflet-draw` (unmaintained, with touch issues on Leaflet 1.8+). It detects self-crossing shapes, and a "enter size + tap the middle" fallback produces a square boundary.
- **Honesty fixes:** missing rainfall is no longer counted as 0. Coverage ("Based on X of Y days") and the source caveat are shown.
- **Removed from the UI:** the NDVI panel. It's P1, always returns 503 without Copernicus credentials, and the backend endpoint is unchanged.
- **Tooling added:** ESLint 9 with jsx-a11y (ESLint 10 isn't supported by jsx-a11y yet), Vitest with 39 tests, and Node 22 via `.nvmrc`.
- **Verified:** lint, typecheck, tests and build are clean. A 12-step headless Chromium walkthrough (iPhone 13 viewport, production build, real backend, live NASA data) ran without console errors three times in a row.
- **Known limitations:**
  - The session token is kept in `localStorage`, and sign-out is client-side only.
  - Esri satellite tile terms need review before public launch.
  - Map drawing isn't keyboard-accessible; the size and coordinate inputs are the accessible alternative.
  - There's no offline mode.

## 8. Field-drawing fix and weather monitoring (2026-11-24)

**Reported bug:** "drawing a box made the map distort and Done couldn't be clicked."

**Root cause:** reproduced in Chromium. There was no rendering defect and no JavaScript error. The editor only supported tap-each-corner drawing:
- dragging a box panned the map (536×259 px) and placed no corners;
- two opposite clicks left Done disabled (2 of 3 corners);
- the mouse wheel zoomed the map out (16 → 10) instead of scrolling the page;
- clicking the first corner or double-clicking added duplicate corners;
- on phones, swiping on the map panned it instead of scrolling to Done.

The disabled reason was shown above the map, away from the button. The server logs confirmed that no save was ever attempted.

**Fix:**
- A "Draw a rectangle" tool (drag, or click two corners; panning paused).
- In corners mode, clicking the first corner or double-clicking finishes the shape, and near-duplicate clicks are ignored.
- Wheel zoom disabled on embedded maps, plus a `ResizeObserver` that calls `invalidateSize`.
- Controls and plain-language validation messages placed above the map.
- Client-side checks that mirror the server's (corner count, self-crossing, size limits).

**Weather:**
- A per-day `weather_observations` cache (migration 0003, applied to Supabase dev).
- A NASA adapter with retries, backoff and timeouts.
- Farm and field summary endpoints: 7- and 30-day totals with coverage, temperature mean/min/max, freshness and delay, saved data served as stale during outages, and explainable rule checks.
- Synchronous weather routes, which resolve the old sync-session-in-async-route issue.
- A dashboard section with trend charts, and a new field page.
- A performance bug caught live: rows read after `rollback()` refreshed one by one, about 2.3 s per cached request against Supabase. It's now about 0.17 s, and a query-count regression test guards it.

**Verified:**
- backend: 51 pytest (SQLite) and 52 (PostgreSQL 16 with Supabase-like roles), Ruff clean;
- frontend: 44 Vitest, lint and typecheck clean;
- browser: 23 Playwright tests (desktop + phone touch), 3 consecutive green runs; mutation checks show the drawing tests fail when the old behaviour is restored;
- live: NASA POWER through Supabase.

**Limitations:**
- alert thresholds are fixed heuristics, not local climate normals;
- the old `weather_cache` table is unused (drop in a later migration);
- Playwright's phone profile is Chromium with touch emulation, not real iOS Safari;
- map drawing is not keyboard-operable (the size and typed-coordinate options are the alternative).

## 9. CI/CD (2026-11-24)

**Implemented:**
- `ci.yml` (reusable), `pull-request.yml`, `deploy.yml` (staging automatic, production behind GitHub Environment approval), `rollback.yml`, `dependabot.yml`;
- `render.yaml` (native Python, auto-deploy off) and `frontend/vercel.json` (Git deployments off);
- scripts: `scripts/smoke_test.py`, `scripts/render_deploy.py`, `backend/scripts/validate_migrations.sh`;
- backend `CORS_ORIGIN_REGEX` for Vercel preview URLs.

**Bugs found while verifying locally:**
- an invalid YAML line that would have broken the PR workflow;
- the migration script leaking `DATABASE_MIGRATION_URL` into pytest, which would have failed CI;
- the scripts not running on macOS's Python 3.9;
- Linux-incompatible `mktemp` usage in the e2e backend script.

**Not yet run on GitHub:** no remote, Render or Vercel accounts yet. See `docs/CICD_DESIGN.md` §4 and §8.

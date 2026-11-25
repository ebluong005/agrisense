# AgriSense — 14-Day Implementation Plan (No Docker)

**Scope:** one engineer, approximately 3–5 hours/day. Existing generated files are not proof of live working code. Stop feature work and cut P1 scope when required security/CI/deployment gates are at risk.

| Day | Engineering work | Demonstrable deliverable and acceptance gate |
|---|---|---|
| 1 | Audit local repository; compare generated ZIP snapshot; remove Docker dependency; verify NASA endpoint and test suite | Document current state and passing `/health` + sample real weather request; identify missing pieces |
| 2 | Supabase dev DB, PostGIS setup, SQLAlchemy connection, fix Alembic, migrate baseline | `alembic upgrade head` runs on isolated dev Postgres; farm create/read survives API restart |
| 3 | Login/register, token/cookie policy, owner-scoped farm CRUD, field CRUD | Two accounts cannot read or mutate each other's farms; auth tests pass |
| 4 | Add spatial field geometry, validation, point onboarding fallback, area calculation | Field polygon persists in PostGIS; validation tests reject invalid geometry |
| 5 | React mobile onboarding, login, farm list and edit flows | User can register and create a farm from a narrow mobile viewport |
| 6 | Interactive map, field drawing/editing, accessibility/fallback | Map polygon is saved and retrieved; fallback point works when map can't be used |
| 7 | Weather provider adapter, normalized observations, cache, missing/stale states | 7/30-day data returned with source, units and completeness; deterministic unit tests |
| 8 | Weather dashboard and simple honest low-rainfall signals | Charts, plain-language summaries and quality flags usable on phone |
| 9 | Backend CI: Ruff, Pytest, isolated DB migration tests; protect `main` | PR is blocked on intentionally failed backend test |
| 10 | Frontend CI: lockfile, ESLint, TypeScript, Vitest, build; staging preview | Intentionally broken TS build blocks merge; Vercel preview loads |
| 11 | Native Render staging backend; Supabase staging; E2E Playwright tests | Signup → farm → field → weather passes with test user in staging |
| 12 | Security/reliability/performance sweep, rate limits, error messages and backups | Cross-user permission tests pass, core slow-network UX verified, backup path documented |
| 13 | Production readiness: release checklists, credential separation, deploy gate, rollback drill | Staging is reproducible and rollback drill completed; pilot release signed off |
| 14 | Production launch (Vercel + Render + Supabase), read-only smoke checks, farmer walkthrough | Public pilot works, monitors running, issues and costs recorded |

## Critical path

Supabase dev connection → schema and migrations → authenticated CRUD → field mapping → normalized weather → UI → CI gates → staging → production. Each dependent step should have a verified test before advancing.

## Sprint cut-line

**Must have:** secure farm/field ownership, onboarding, real weather, dated low-rainfall info, responsive dashboard, tested managed DB, CI, deploy, smoke tests. **Defer:** Copernicus NDVI, USDM map overlay, SMS/email, ML, billing, offline sync, Redis, queue, complex forecasting. If optional NDVI already exists, keep it disabled without credentials until quality and quota handling are verified.

## MVP acceptance checklist

- [ ] Farmer can create an account, login, logout and access only their own records.
- [ ] Farmer can create/edit/delete farm and add field boundary or location fallback.
- [ ] Field metadata and valid geometry persist in Supabase after restart.
- [ ] Field dashboard shows real dated NASA observations with units, source and missing/stale indicators.
- [ ] Alert text says what triggered it and avoids precise irrigation/disease claims.
- [ ] UI is usable at 360px width and on a throttled slow network.
- [ ] Tests verify ownership, input bounds, provider failures, caching, migration path and core UI.
- [ ] CI blocks merge on test/build failure, with no production secrets in PR jobs.
- [ ] Vercel frontend, native Render FastAPI and Supabase DB work end-to-end without Docker.
- [ ] Post-release smoke checks, logs, budget alerts, backup/restore and rollback procedure are documented.

## Interview-oriented milestones

- **After Day 2:** Explain PostGIS vs ordinary SQL and how Alembic prevents schema drift.
- **After Day 7:** Walk through a cache hit versus miss and error handling.
- **After Day 10:** Explain why branch protection and previews are meaningful deployment gates.
- **After Day 14:** Draw the system and defend monolith, caching, security, scaling and cost choices.

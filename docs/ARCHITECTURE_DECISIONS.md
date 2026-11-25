# AgriSense — Architecture Decision Records

All decisions are **proposed** as of 2026-11-24; verify against the actual checkout.

## ADR-001: Docker-free deployment
- **Decision:** Native local Python/npm, managed Supabase Postgres/PostGIS, Vercel frontend, native Render FastAPI. No Dockerfiles, Compose, or containerized GitHub Actions test service setup.
- **Reason:** Developer explicitly prefers no Docker; reduces environment management for a two-week solo sprint.
- **Consequence:** Requires provider accounts and reliable internet for DB development. Integration tests need isolated managed DB. Infrastructure depends on cloud vendor availability.

## ADR-002: Modular monolith API
- **Decision:** Single FastAPI application with explicit route, service and provider-adapter modules.
- **Reason:** Easy deployment and strong ownership boundaries; premature services would increase cost and debugging time.
- **Revisit:** Independent teams, independently scalable workloads or heavy NDVI processing.

## ADR-003: Managed relational and spatial storage
- **Decision:** PostgreSQL + PostGIS on Supabase, Alembic migrations, SQLAlchemy ORM.
- **Reason:** Farm ownership is relational and field polygons require spatial operators/accurate area queries.
- **Consequence:** Must plan extension schema, SSL, connection limits, backups and DB privileges.

## ADR-004: Server-controlled environmental integrations
- **Decision:** FastAPI fetches, normalizes and caches NASA observations; optional Sentinel/USDM later.
- **Reason:** Keeps credentials private, consolidates units and quality flags and protects third-party quotas.
- **Consequence:** Backend is responsible for provider errors and caching. Stale data must be clearly labelled.

## ADR-005: Evidence-based alerts
- **Decision:** Rules include source, measurement window, data-completeness and cautious language.
- **Reason:** Vegetation change and regional drought are not direct proof of field soil moisture or disease.
- **Consequence:** Favor informative alerts, not prescriptive irrigation advice, until validated agronomic models exist.

## ADR-006: Automated quality gates
- **Decision:** GitHub Actions for Python and frontend checks; required branch protection; preview/staging smoke and controlled production release.
- **Reason:** Prevent regressions during the compressed delivery schedule.
- **Consequence:** CI scripts and lockfiles must be created; staging DB must be isolated.

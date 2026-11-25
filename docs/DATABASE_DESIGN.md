# AgriSense — Database Design

**Target:** Supabase-managed PostgreSQL + PostGIS. **No Docker.** This is a proposed schema, not an applied migration. Create separate development/staging/production projects or databases with isolated credentials; never run a destructive migration against production without review.

## ER diagram

```mermaid
erDiagram
  USERS ||--o{ FARMS : owns
  FARMS ||--o{ FIELDS : contains
  FIELDS ||--o{ CROP_SEASONS : grows
  FIELDS ||--o{ FIELD_WEATHER_SUMMARIES : references
  WEATHER_OBSERVATIONS ||--o{ FIELD_WEATHER_SUMMARIES : provides
  FIELDS ||--o{ VEGETATION_OBSERVATIONS : measures
  FIELDS ||--o{ ALERTS : triggers
  REGIONAL_DROUGHT_OBSERVATIONS ||--o{ FIELDS : contextualizes
  USERS { uuid id PK; string email UK; string password_hash; timestamp created_at }
  FARMS { uuid id PK; uuid owner_id FK; string name; float latitude; float longitude }
  FIELDS { uuid id PK; uuid farm_id FK; string name; geometry boundary; float area_hectares }
  CROP_SEASONS { uuid id PK; uuid field_id FK; string crop_name; date planted_on }
  WEATHER_OBSERVATIONS { bigint id PK; string location_key; date observed_on; float precipitation_mm; float mean_temp_c }
  FIELD_WEATHER_SUMMARIES { uuid field_id FK; bigint observation_id FK; string sampling_method }
  VEGETATION_OBSERVATIONS { uuid id PK; uuid field_id FK; date observed_on; float ndvi_mean; float valid_pixel_fraction }
  REGIONAL_DROUGHT_OBSERVATIONS { uuid id PK; string area_code; date published_on; string category }
  ALERTS { uuid id PK; uuid field_id FK; string rule_code; date period_end; string status }
```

Mermaid indicates conceptual relationships; the drought association is a **spatial/administrative lookup**, not a necessary direct FK. Drought categories are regional, not precise at field scale.

## Proposed tables and constraints

| Table | Important columns | Keys / indexes / notes |
|---|---|---|
| `users` | `id UUID`, `email CITEXT`, `password_hash`, `created_at` | email unique; if selecting Supabase Auth, use `auth.users` and remove app password hashes |
| `farms` | `id UUID`, `owner_id UUID`, `name`, `latitude`, `longitude`, `created_at` | FK owner; index `(owner_id, created_at)`; latitude ±90 and longitude ±180 constraints |
| `fields` | `id UUID`, `farm_id UUID`, `name`, `boundary geometry(MultiPolygon,4326)`, `area_hectares` | FK farm; spatial GiST index on boundary; enforce valid geometry and area limits |
| `crop_seasons` | `id`, `field_id`, `crop_name`, `planted_on`, `harvested_on` | field FK; check harvest after planting |
| `weather_observations` | `id`, `provider`, `location_key`, `observed_on`, `precipitation_mm`, `temperature_c`, `temperature_min_c`, `temperature_max_c`, `retrieved_at` | **Implemented (migration 0003).** Unique `(provider, location_key, observed_on)` also serves range reads; upserted with `ON CONFLICT`. `location_key` = lat/lon rounded to 0.01°. Nulls = no valid measurement. Days within 14 days of today are re-fetched after 12 h (3 h if missing) because NASA revises them; older days are never re-fetched. RLS on, no Data API access. |
| `field_weather_summaries` | `field_id`, `weather_observation_id`, `sampling_method` | composite PK; optional join table if shared grid points warrant it |
| `vegetation_observations` | `id`, `field_id`, `observation_window_start/end`, `ndvi_mean`, `valid_pixel_fraction`, `sample_count`, `provider`, `algorithm_version` | unique by field/date window/algorithm; null NDVI when no valid pixels |
| `regional_drought_observations` | `id`, `region_id`, `publication_date`, `category`, `source` | region/date unique; spatial overlay or admin lookup |
| `alerts` | `id`, `field_id`, `rule_code`, `window_end`, `severity`, `explanation_json`, `status`, `created_at` | unique `(field_id,rule_code,window_end)`; only persist evidence-backed alerts |
| `jobs` (P1) | `id`, `kind`, `dedupe_key`, `state`, `attempts`, `requested_at`, `finished_at` | `dedupe_key` unique; only add when asynchronous jobs introduced |

## Spatial data specifics

- Choose `geometry(MultiPolygon, 4326)` to store and spatially intersect field boundaries; normalize input GeoJSON, validate ring closure and self-intersections, constrain maximum polygon size/vertex count, and reject impossible coordinates.
- WGS84 longitude/latitude is not a metric coordinate system. **Do not use `ST_Area(geometry)` expecting square meters.** For geographically dispersed farms, `ST_Area(boundary::geography)` returns square meters (for valid geography-cast geometry); hectares = `/ 10000`, acres approximately `/ 4046.8564224`.
- For metric distance, use appropriate projected CRS or geography functions. `geography` can be suitable for accurate global-area/distance computations, while `geometry` offers flexible GIS operators and indexing.
- Avoid rendering polygon coordinates in server logs; field geometry can reveal sensitive farm location information.

### PostGIS setup (Supabase SQL editor, one-time)

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
-- Confirm the extension schema and functions before applying GeoAlchemy migrations.
SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname = 'postgis';
```

Supabase may expose spatial types in an `extensions` schema. Ensure the DB connection/search_path and GeoAlchemy2 column configuration agree on schema; do **not** hardcode an unverified extension schema into migration scripts. Refer to the official Supabase PostGIS setup guide.

### Example migration-oriented SQL sketch

```sql
CREATE TABLE farms (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(150) NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_farms_owner_created ON farms(owner_id, created_at DESC);
-- Field geometry must be installed only AFTER enabling PostGIS;
-- prefer Alembic/GeoAlchemy to manage the spatial column and GIST index.
```

**Migration operations:** Verify `alembic.ini` has `[alembic] script_location = %(here)s/alembic`, import models to `target_metadata`, then `alembic revision --autogenerate` and **review** generated SQL before `alembic upgrade head`. Use `alembic check` in CI where supported. Run real migration tests on isolated PostgreSQL/PostGIS, not only SQLite (SQLite cannot validate spatial behavior).

## Tenancy and auth choices

**Implemented (2026-11-24):** all tables have RLS enabled with no policies, and `anon`/`authenticated` have no privileges (migration `0002_enable_rls`). The Supabase Data API therefore cannot read or write app data; only FastAPI (connected as the table owner) can. New tables must follow the same rule.

**Recommended shortest path:** Keep existing FastAPI user authentication if working and tested; all DB access through backend using a limited DB role. Add owner filters on farm queries and enforce field ownership through farm relationship. **Alternative:** Supabase Auth with server-side JWT validation and optional RLS; if selected, do not simultaneously maintain independent user password tables. RLS can provide defense-in-depth if clients query Supabase directly, but is not a replacement for FastAPI authorization.

## Retention and privacy

Persist aggregated historical weather observations and derived NDVI values; avoid redundant full satellite raster storage. Allow owner-requested deletion and export. Define retention and backups for user data; provider-derived measurements may be retained longer when licensing permits. Encrypt in transit and at rest via managed services and use backups that have been restore-tested.

## Review questions

1. Why is a `GiST` index useful on a field boundary?
2. What breaks if you estimate hectares using `ST_Area(boundary)` with SRID 4326?
3. Why is a farm ownership check needed even when field IDs are UUIDs?
4. Which data belongs in fields versus weather observations and why?

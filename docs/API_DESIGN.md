# AgriSense — REST API Design

**Base:** `/api/v1` on FastAPI. Authentication required unless marked public. Keep JSON property names stable and return ISO-8601 timestamps and units in responses. Examples are API contracts, **not evidence of implemented endpoints**.

## Endpoints

| Method | Path | Input | Result | Auth |
|---|---|---|---|---|
| POST | `/auth/register` | email, password | 201 account/session (design choice) | Public |
| POST | `/auth/login` | email, password | 200 session/token | Public |
| POST | `/auth/logout` | cookie/session revoke | 204 | Required |
| GET | `/auth/me` | — | 200 user profile | Required |
| POST | `/farms` | name, lat, lon | 201 farm | Required |
| GET | `/farms?limit=20&cursor=...` | pagination | 200 list | Required |
| GET | `/farms/{farm_id}` | id | 200 farm | Required |
| PATCH | `/farms/{farm_id}` | partial name/location | 200 farm | Owner |
| DELETE | `/farms/{farm_id}` | id | 204 | Owner |
| POST | `/farms/{farm_id}/fields` | name, GeoJSON polygon/point | 201 field | Owner |
| GET | `/farms/{farm_id}/fields` | pagination | 200 fields | Owner |
| PATCH | `/fields/{field_id}` | partial field | 200 field | Owner |
| DELETE | `/fields/{field_id}` | id | 204 | Owner |
| GET | `/farms/{farm_id}/weather/summary` | — | 200 30-day summary, alerts, freshness: **implemented** | Owner |
| GET | `/fields/{field_id}/weather/summary` | — | 200 same, at the field boundary's centre: **implemented** | Owner |
| GET | `/fields/{field_id}/weather?days=30` | days=7/30/90 | 200 normalized summary and series (superseded by `/weather/summary`) | Owner |
| GET | `/farms/{farm_id}/weather?start=YYYY-MM-DD&end=...` | dates | 200 normalized series | Owner |
| GET | `/fields/{field_id}/alerts` | status and cursor | 200 rules/explanations | Owner |
| GET | `/fields/{field_id}/drought` | — | 200 dated regional category or unavailable | Owner, P1 |
| GET | `/fields/{field_id}/ndvi?start=...&end=...` | dates | 200 dated stats or pending/unavailable | Owner, P1 |
| GET | `/health` | — | 200 app alive | Public |
| GET | `/ready` | — | 200 `{"status":"ready"}` / 503 `{"detail":"Database unavailable"}` — **implemented** (public for now; restrict before production) | Internal-only or restricted |

**Implemented today (verified 2026-11-24, `backend/app/main.py`):** `/health`, `/ready`, and `/auth/register`, `/auth/login`, `/auth/me`, farm GET/POST/PUT/DELETE, field GET/POST/PUT/DELETE, coordinate/farm weather, alerts and an optional field NDVI route. Implemented farm/field updates use `PUT`, lists are unpaginated, IDs are integers, and `/api/v1/weather/history` requires auth. The table above is the **target contract** (PATCH, cursor pagination, UUIDs); converge in separate, tested changes.

## Request and response examples

### Create farm

```http
POST /api/v1/farms
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: 6c82545d-a8f6-45a8-a9bc-b0a3e7f4f859

{"name":"North Plot","latitude":32.2226,"longitude":-110.9747}
```

```json
{
  "id":"a443b4ca-f5ab-4315-8bfc-f2282f5a5b33",
  "name":"North Plot", "latitude":32.2226, "longitude":-110.9747,
  "created_at":"2026-11-24T20:00:00Z"
}
```

### Create field (geometry in WGS84, longitude first)

```json
{
  "name":"East Field",
  "geometry":{
    "type":"Polygon",
    "coordinates":[[[-110.975,32.223],[-110.974,32.223],[-110.974,32.222],[-110.975,32.222],[-110.975,32.223]]]
  }
}
```

Server should validate polygon closure, self-intersections, maximum vertex count and geographic bounds; compute area on server, not trust `area_hectares` supplied by browser. Provide coordinate-only fallback via separate clearly typed field location where mapping is infeasible.

### Field weather response (example structure only; numbers illustrative)

```json
{
  "field_id":"fe6c3bda-938f-4e4f-8e70-4d4511b539f1",
  "source":"NASA POWER",
  "source_type":"gridded weather estimate",
  "units":{"precipitation":"mm","temperature":"C"},
  "observed_range":{"start":"2026-10-01","end":"2026-10-02"},
  "retrieved_at":"2026-11-24T20:10:00Z",
  "stale":false,
  "completeness":{"valid_days":2,"expected_days":2},
  "daily":[
    {"date":"2026-10-01","precipitation_mm":0.0,"temperature_c":22.71},
    {"date":"2026-10-02","precipitation_mm":0.0,"temperature_c":23.67}
  ],
  "summary":{"precipitation_total_mm":0.0,"mean_temperature_c":23.19}
}
```

Values shown above reflect the user-supplied early-October example, but the response structure is proposed; actual endpoints must not fabricate data.

### Explainable alert example

```json
{
  "code":"LOW_RAINFALL_7D",
  "severity":"info",
  "field_id":"fe6c3bda-938f-4e4f-8e70-4d4511b539f1",
  "period_start":"2026-10-01", "period_end":"2026-10-07",
  "evidence":{"rainfall_mm":0.12,"valid_days":7},
  "explanation":"Very little rainfall was reported in this seven-day period. This alone is not a drought or soil-moisture diagnosis.",
  "source":"NASA POWER", "action":"Inspect field if you have crop concerns"
}
```

## Weather summary (implemented 2026-11-24)

`GET /api/v1/farms/{id}/weather/summary` and `GET /api/v1/fields/{id}/weather/summary` (owner only; 404 for other users' resources, with no provider call).

- **Window:** fetches the 45 days ending yesterday (UTC). Totals use windows that **end on the newest day with rainfall data** (`freshness.latest_observation_date`), so NASA's publication delay is never counted as dry days.
- **Location:** farm = farm point; field = centroid of the boundary. Rounded to 0.01° (`location`), which is also the cache key.
- **Response:**
  - `target`, `location`, `requested_range`;
  - `source` (name, dataset, parameters, spatial resolution, caveat);
  - `units` (`mm`, `°C`);
  - `freshness` (`status` current/delayed/no_data, `latest_observation_date`, `days_since_latest`, `retrieved_at`, `stale`, `warning`);
  - `precipitation.last_7_days` / `last_30_days` (`start`, `end`, `valid_days`, `expected_days`, `total_mm` or `null`, `complete`);
  - `temperature` (`mean_c`, `lowest_c`, `highest_c`, coverage);
  - `alerts[]`, `checks[]`, and `daily[]` (nulls for missing values, never 0).
- **Alert rules** (heuristics, `app/weather.py` `RAINFALL_RULES`). Each alert carries `evidence` (measured mm, threshold, window, coverage), `limitations` and `suggested_action`. Each rule also reports a `checks[]` status: `triggered` / `not_triggered` / `insufficient_data`.

| Code | Triggers when | Needs at least | Severity |
|---|---|---|---|
| `LOW_RAINFALL_7D` | 7-day total < 2.0 mm | 6 of 7 days with data | watch |
| `LOW_RAINFALL_30D` | 30-day total < 12.7 mm (0.5 in) | 27 of 30 days with data | watch |

  No drought severity classes, soil-moisture or disease claims are made. These rules compare against fixed thresholds, not local climate normals (planned improvement).
- **Errors:** NASA POWER timeout → **504**; unreachable or 429/5xx after 3 attempts with backoff → **503**; rejected request or unreadable data → **502**. If saved days exist, the API returns **200** with `freshness.stale = true` and a warning instead of an error.
- **Legacy endpoints kept:** `/weather/history`, `/farms/{id}/weather` and `/farms/{id}/alerts` keep their response shapes and now use the same cache. `/weather/history` validates: start ≤ end, end ≤ today, ≤ 366 days, start ≥ 1981-01-01 (400).

## HTTP and error contracts

- `400`: invalid date relationships; `401`: missing/invalid credentials; `403`: authenticated but forbidden (use `404` for non-owned farm IDs to prevent enumeration); `404`: not found; `409`: duplicate/conflicting operation; `422`: schema validation; `429`: rate limited; `502/503`: upstream dependency invalid/unavailable; `500`: unexpected internal problem.
- Standardize errors: `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"Weather temporarily unavailable","request_id":"...","retryable":true}}`. Avoid exposing provider credentials or stack traces.
- Bound `days` and date range to protect cost and performance. Paginate lists; document deterministic ordering and opaque cursors. Default to ≤20 resources per page.
- Mutations should support idempotency when repeat submission is likely (create farm, schedule NDVI); rate-limit costly provider calls. GETs should be safe/idempotent.
- Never accept `owner_id` to override authenticated identity. Use DB-level ownership joins and tests.
- Version API under `/api/v1`. Introduce `/v2` only for breaking schema changes.

## Review questions

1. When should FastAPI return 422 versus 400?
2. Why is `Idempotency-Key` useful on a slow mobile connection?
3. What should a client display when the weather provider is unavailable but cached data is six days old?

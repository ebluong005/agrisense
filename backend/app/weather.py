"""Weather service: per-day cache over NASA POWER, rainfall/temperature summaries, explainable alerts.

Flow for a request (see docs/SYSTEM_DESIGN.md §4):
  1. read cached days for the location and range, then end the DB transaction;
  2. fetch from NASA only the span of days that are missing or may still be revised;
  3. upsert those days in a new short transaction;
  4. compute windows and alerts from the merged series.
If NASA fails but saved days exist, they are returned with `stale=True` instead of an error.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from . import nasa_power
from .models import WeatherObservation

PROVIDER = "nasa_power"
LOCATION_DECIMALS = 2  # ~1 km; NASA POWER's grid is ~50 km, so nearby fields share cached days

# NASA publishes with a delay and may revise the last couple of weeks.
REVISABLE_DAYS = 14
REFRESH_REVISABLE_AFTER = timedelta(hours=12)
RETRY_MISSING_AFTER = timedelta(hours=3)

SUMMARY_WINDOW_DAYS = 30
SUMMARY_FETCH_DAYS = 45  # 30-day window + room for publication delay
DELAYED_AFTER_DAYS = 7  # newest data older than this is flagged as delayed

SOURCE = {
    "name": "NASA POWER",
    "url": "https://power.larc.nasa.gov/",
    "dataset": "Daily point data, Agroclimatology community",
    "parameters": {
        "precipitation": "PRECTOTCORR (bias-corrected precipitation)",
        "temperature": "T2M, T2M_MIN, T2M_MAX (air temperature at 2 m)",
    },
    "spatial_resolution": "About 0.5° × 0.625° grid cells (roughly 50 km across)",
    "description": (
        "Modelled estimates for the surrounding area from satellite observations and weather models. "
        "Not a measurement taken in your field."
    ),
}
UNITS = {"precipitation": "mm", "temperature": "°C"}


def utcnow() -> datetime:  # test seam
    return datetime.now(UTC)


def human_date(d: date) -> str:
    """ "Nov 3, 2026" (portable; strftime %-d is not)."""
    return f"{d:%b} {d.day}, {d.year}"


# --------------------------------------------------------------------------- cache


@dataclass(frozen=True)
class Day:
    day: date
    precipitation_mm: float | None
    temperature_c: float | None
    temperature_min_c: float | None
    temperature_max_c: float | None
    retrieved_at: datetime


@dataclass(frozen=True)
class Series:
    latitude: float  # the (rounded) point the provider was queried at
    longitude: float
    days: list[Day]
    stale: bool  # provider failed; some or all days are older saved copies
    warning: str | None


def location_key(latitude: float, longitude: float) -> tuple[str, float, float]:
    lat, lon = round(latitude, LOCATION_DECIMALS), round(longitude, LOCATION_DECIMALS)
    return f"{lat:.{LOCATION_DECIMALS}f},{lon:.{LOCATION_DECIMALS}f}", lat, lon


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)  # SQLite drops tzinfo


def _needs_fetch(row: Day | None, day: date, now: datetime) -> bool:
    if row is None:
        return True
    if (now.date() - day).days > REVISABLE_DAYS:
        return False  # settled history: never re-download
    age = now - row.retrieved_at
    missing = row.precipitation_mm is None or row.temperature_c is None
    return age > (RETRY_MISSING_AFTER if missing else REFRESH_REVISABLE_AFTER)


def get_daily(db: Session, latitude: float, longitude: float, start: date, end: date) -> Series:
    """Daily values for [start, end], served from cache where possible."""
    key, lat, lon = location_key(latitude, longitude)
    now = utcnow()
    rows = _load(db, key, start, end)
    db.rollback()  # never hold a transaction open while waiting on the network

    wanted = [start + timedelta(n) for n in range((end - start).days + 1)]
    to_fetch = [d for d in wanted if _needs_fetch(rows.get(d), d, now)]
    stale, warning = False, None
    if to_fetch:
        try:
            fetched = nasa_power.fetch_daily(lat, lon, min(to_fetch), max(to_fetch))
        except nasa_power.ProviderError:
            if not rows:
                raise
            stale = True
            newest = max(r.retrieved_at for r in rows.values())
            warning = (
                f"{nasa_power.SOURCE_NAME} could not be reached, so saved data is shown "
                f"(last updated {human_date(newest.date())} {newest:%H:%M} UTC). Recent days may be missing."
            )
        else:
            _upsert(db, key, fetched, now)
            rows = _load(db, key, start, end)
            db.rollback()

    days = [rows[d] for d in wanted if d in rows]
    return Series(lat, lon, days, stale, warning)


def _load(db: Session, key: str, start: date, end: date) -> dict[date, Day]:
    """Plain value snapshots, not ORM objects: rollback() expires ORM objects, and every
    later attribute access would then issue its own refresh query (one round trip per row)."""
    o = WeatherObservation
    columns = (
        o.observed_on,
        o.precipitation_mm,
        o.temperature_c,
        o.temperature_min_c,
        o.temperature_max_c,
        o.retrieved_at,
    )
    stmt = select(*columns).where(
        o.provider == PROVIDER, o.location_key == key, o.observed_on.between(start, end)
    )
    return {r[0]: Day(r[0], r[1], r[2], r[3], r[4], _as_utc(r[5])) for r in db.execute(stmt)}


def _upsert(db: Session, key: str, fetched: list[nasa_power.DailyValues], now: datetime) -> None:
    if not fetched:
        return
    values = [
        {
            "provider": PROVIDER,
            "location_key": key,
            "observed_on": v.day,
            "precipitation_mm": v.precipitation_mm,
            "temperature_c": v.temperature_c,
            "temperature_min_c": v.temperature_min_c,
            "temperature_max_c": v.temperature_max_c,
            "retrieved_at": now,
        }
        for v in fetched
    ]
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    stmt = insert(WeatherObservation).values(values)
    updatable = (
        "precipitation_mm",
        "temperature_c",
        "temperature_min_c",
        "temperature_max_c",
        "retrieved_at",
    )
    # ON CONFLICT makes concurrent requests for the same location safe.
    stmt = stmt.on_conflict_do_update(
        index_elements=["provider", "location_key", "observed_on"],
        set_={c: getattr(stmt.excluded, c) for c in updatable},
    )
    db.execute(stmt)
    db.commit()


# --------------------------------------------------------------------------- summary


def _window(days: dict[date, Day], end: date, length: int) -> dict:
    span = [end - timedelta(n) for n in range(length - 1, -1, -1)]
    rain = [days[d].precipitation_mm for d in span if d in days and days[d].precipitation_mm is not None]
    return {
        "start": span[0],
        "end": span[-1],
        "expected_days": length,
        "valid_days": len(rain),
        "total_mm": round(sum(rain), 2) if rain else None,
        "complete": len(rain) == length,
    }


def _temperature(days: dict[date, Day], end: date, length: int) -> dict:
    span = [days[end - timedelta(n)] for n in range(length) if end - timedelta(n) in days]
    means = [d.temperature_c for d in span if d.temperature_c is not None]
    lows = [d.temperature_min_c for d in span if d.temperature_min_c is not None]
    highs = [d.temperature_max_c for d in span if d.temperature_max_c is not None]
    return {
        "mean_c": round(sum(means) / len(means), 2) if means else None,
        "lowest_c": min(lows) if lows else None,
        "highest_c": max(highs) if highs else None,
        "valid_days": len(means),
        "expected_days": length,
    }


def summarize(series: Series, today: date) -> dict:
    """Totals use windows that END on the newest day with rainfall data, so publication
    delay never counts as dry days. Every number states its window and coverage."""
    by_day = {d.day: d for d in series.days}
    latest = max((d.day for d in series.days if d.precipitation_mm is not None), default=None)
    if latest is None:
        totals, temperature, lag = None, None, None
    else:
        totals = {
            "last_7_days": _window(by_day, latest, 7),
            "last_30_days": _window(by_day, latest, SUMMARY_WINDOW_DAYS),
        }
        temperature = _temperature(by_day, latest, SUMMARY_WINDOW_DAYS)
        lag = (today - latest).days
    status = "no_data" if latest is None else ("delayed" if lag > DELAYED_AFTER_DAYS else "current")
    checks = evaluate_rainfall_rules(totals)
    return {
        "source": SOURCE,
        "units": UNITS,
        "freshness": {
            "status": status,
            "latest_observation_date": latest,
            "days_since_latest": lag,
            "retrieved_at": max((d.retrieved_at for d in series.days), default=None),
            "stale": series.stale,
            "warning": series.warning,
        },
        "precipitation": totals,
        "temperature": temperature,
        "alerts": [c["alert"] for c in checks if c["alert"]],
        "checks": [{k: v for k, v in c.items() if k != "alert"} for c in checks],
        "daily": [
            {
                "date": d.day,
                "precipitation_mm": d.precipitation_mm,
                "temperature_c": d.temperature_c,
                "temperature_min_c": d.temperature_min_c,
                "temperature_max_c": d.temperature_max_c,
            }
            for d in series.days
        ],
    }


# --------------------------------------------------------------------------- alert rules


@dataclass(frozen=True)
class RainfallRule:
    code: str
    window: str  # key in totals
    days: int
    threshold_mm: float
    min_valid_days: int  # below this coverage we don't judge at all
    title: str


# Simple, documented heuristics: prompts to look at a field, not drought classifications.
RAINFALL_RULES = (
    RainfallRule("LOW_RAINFALL_7D", "last_7_days", 7, 2.0, 6, "Very little rain in the last 7 days"),
    RainfallRule("LOW_RAINFALL_30D", "last_30_days", 30, 12.7, 27, "Very little rain in the last 30 days"),
)

LIMITATION = (
    "This is based on area-wide rainfall estimates. It does not measure soil moisture, "
    "does not account for irrigation, and is not a drought classification."
)


def evaluate_rainfall_rules(
    totals: dict | None, rules: tuple[RainfallRule, ...] = RAINFALL_RULES
) -> list[dict]:
    """Each rule reports triggered / not_triggered / insufficient_data with the numbers behind it."""
    results = []
    for rule in rules:
        window = totals[rule.window] if totals else None
        base = {"code": rule.code, "threshold_mm": rule.threshold_mm, "window_days": rule.days}
        if window is None or window["valid_days"] < rule.min_valid_days:
            have = window["valid_days"] if window else 0
            results.append(
                {
                    **base,
                    "status": "insufficient_data",
                    "explanation": f"Not checked: only {have} of {rule.days} days have rainfall data (needs {rule.min_valid_days}).",
                    "alert": None,
                }
            )
            continue
        total = window["total_mm"]
        triggered = total < rule.threshold_mm
        period = f"{human_date(window['start'])} to {human_date(window['end'])}"
        coverage = (
            "all days had data"
            if window["complete"]
            else f"{window['valid_days']} of {rule.days} days had data"
        )
        evidence = {
            "rainfall_mm": total,
            "threshold_mm": rule.threshold_mm,
            "window_start": window["start"],
            "window_end": window["end"],
            "valid_days": window["valid_days"],
            "expected_days": rule.days,
        }
        explanation = (
            f"{total:.1f} mm of rain was estimated for {period} ({coverage}). "
            f"This rule {'triggers' if triggered else 'would trigger'} below {rule.threshold_mm:g} mm."
        )
        results.append(
            {
                **base,
                "status": "triggered" if triggered else "not_triggered",
                "explanation": explanation,
                "alert": {
                    "code": rule.code,
                    "severity": "watch",
                    "title": rule.title,
                    "explanation": explanation,
                    "evidence": evidence,
                    "limitations": LIMITATION,
                    "suggested_action": "If the crop isn't irrigated, consider checking soil moisture and plant condition in the field.",
                    "source": nasa_power.SOURCE_NAME,
                }
                if triggered
                else None,
            }
        )
    return results


def summary_for_point(db: Session, latitude: float, longitude: float) -> dict:
    """Summary for the 30-day window ending at the newest published day (fetches ~45 days)."""
    today = utcnow().date()
    end = today - timedelta(days=1)
    start = end - timedelta(days=SUMMARY_FETCH_DAYS - 1)
    series = get_daily(db, latitude, longitude, start, end)
    result = summarize(series, today)
    result["location"] = {"latitude": series.latitude, "longitude": series.longitude}
    result["requested_range"] = {"start": start, "end": end}
    return result

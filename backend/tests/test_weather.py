"""Weather: NASA POWER adapter, per-day cache, summaries, alert rules, farm/field association.

No network: NASA POWER is replaced by an httpx.MockTransport that builds a response for
whatever date range is requested. The clock is frozen at 2026-11-24 12:00 UTC.
"""

from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from helpers import register
from sqlalchemy import event

from app import nasa_power, weather
from app.weather import RAINFALL_RULES, Day, Series, evaluate_rainfall_rules, summarize

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)
TODAY = NOW.date()
SQUARE = {
    "type": "Polygon",
    "coordinates": [
        [[-110.98, 32.20], [-110.96, 32.20], [-110.96, 32.22], [-110.98, 32.22], [-110.98, 32.20]]
    ],
}


class FakeNasa:
    """Answers any range. `rain(day)` / `temp(day)` return a value or None (sent as -999)."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.failures: list[int | str] = []  # queued: HTTP status, "timeout" or "garbage"
        self.rain = lambda d: 1.0
        self.temp = lambda d: 15.0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.failures:
            failure = self.failures.pop(0)
            if failure == "timeout":
                raise httpx.ReadTimeout("slow", request=request)
            if failure == "garbage":
                return httpx.Response(200, json={"unexpected": True})
            return httpx.Response(failure, json={"error": "upstream"})
        p = request.url.params
        start, end = (datetime.strptime(p[k], "%Y%m%d").date() for k in ("start", "end"))
        days = [start + timedelta(n) for n in range((end - start).days + 1)]
        series = {"PRECTOTCORR": {}, "T2M": {}, "T2M_MIN": {}, "T2M_MAX": {}}
        for d in days:
            k = d.strftime("%Y%m%d")
            r, t = self.rain(d), self.temp(d)
            series["PRECTOTCORR"][k] = -999.0 if r is None else r
            series["T2M"][k] = -999.0 if t is None else t
            series["T2M_MIN"][k] = -999.0 if t is None else t - 5
            series["T2M_MAX"][k] = -999.0 if t is None else t + 5
        return httpx.Response(
            200, json={"header": {"fill_value": -999.0}, "properties": {"parameter": series}}
        )

    def ranges(self):
        return [(r.url.params["start"], r.url.params["end"]) for r in self.requests]


@pytest.fixture
def nasa(monkeypatch):
    fake = FakeNasa()
    monkeypatch.setattr(nasa_power, "transport", httpx.MockTransport(fake.handler))
    monkeypatch.setattr(nasa_power, "sleep", lambda s: None)
    monkeypatch.setattr(weather, "utcnow", lambda: NOW)
    return fake


@pytest.fixture
def user(client):
    return register(client)


def make_farm(client, headers, lat=32.2226, lon=-110.9747):
    r = client.post(
        "/api/v1/farms", headers=headers, json={"name": "Test", "latitude": lat, "longitude": lon}
    )
    assert r.status_code == 201, r.text
    return r.json()


def history(client, headers, start="2026-11-01", end="2026-11-03", lat=32.2226, lon=-110.9747):
    return client.get(
        f"/api/v1/weather/history?latitude={lat}&longitude={lon}&start={start}&end={end}", headers=headers
    )


# ------------------------------------------------------------------ provider adapter


def test_successful_response_is_parsed_with_all_parameters(client, nasa, user):
    nasa.temp = lambda d: None if d == date(2026, 11, 3) else 15.0
    r = history(client, user)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "NASA POWER"
    assert body["daily"] == [
        {"date": "2026-11-01", "temperature_c": 15.0, "precipitation_mm": 1.0},
        {"date": "2026-11-02", "temperature_c": 15.0, "precipitation_mm": 1.0},
        {"date": "2026-11-03", "temperature_c": None, "precipitation_mm": 1.0},  # -999 -> missing
    ]
    params = nasa.requests[0].url.params
    assert params["parameters"] == "PRECTOTCORR,T2M,T2M_MIN,T2M_MAX"
    assert params["community"] == "AG"
    assert (params["latitude"], params["longitude"]) == ("32.22", "-110.97")  # rounded cache point


def test_fill_values_and_non_numbers_become_none_never_zero():
    for raw in (-999, -999.0, None, "n/a", True):
        assert nasa_power._value(raw, -999.0) is None
    assert nasa_power._value(0, -999.0) == 0.0


@pytest.mark.parametrize(
    ("query", "status"),
    [
        ("latitude=132&longitude=-111&start=2026-11-01&end=2026-11-03", 422),
        ("latitude=32&longitude=-181&start=2026-11-01&end=2026-11-03", 422),
        ("latitude=32&longitude=-111&start=2026-11-08&end=2026-11-01", 400),
        ("latitude=32&longitude=-111&start=2026-11-01&end=2026-12-01", 400),  # future
        ("latitude=32&longitude=-111&start=2024-01-01&end=2025-06-01", 400),  # > 366 days
        ("latitude=32&longitude=-111&start=1980-12-01&end=1981-01-05", 400),  # before NASA POWER data
        ("latitude=32&longitude=-111&start=not-a-date&end=2026-11-01", 422),
    ],
)
def test_invalid_coordinates_and_ranges_are_rejected_before_calling_nasa(client, nasa, user, query, status):
    assert client.get(f"/api/v1/weather/history?{query}", headers=user).status_code == status
    assert nasa.requests == []


def test_retries_transient_failures_then_succeeds(client, nasa, user):
    nasa.failures = [503, "timeout"]
    assert history(client, user).status_code == 200
    assert len(nasa.requests) == 3


@pytest.mark.parametrize(
    ("failures", "status", "attempts", "message"),
    [
        ([500, 502, 503], 503, 3, "NASA POWER is temporarily unavailable."),
        (["timeout"] * 3, 504, 3, "NASA POWER took too long to respond."),
        ([400], 502, 1, "NASA POWER rejected the request"),  # not retried
        (["garbage"], 502, 1, "NASA POWER returned data that could not be read."),
    ],
)
def test_provider_failures_map_to_clear_errors(client, nasa, user, failures, status, attempts, message):
    nasa.failures = list(failures)
    r = history(client, user)
    assert r.status_code == status
    assert r.json()["detail"].startswith(message)
    assert len(nasa.requests) == attempts


# ------------------------------------------------------------------ cache


def test_repeat_request_is_served_from_cache(client, nasa, user):
    assert history(client, user).status_code == 200
    assert history(client, user).status_code == 200
    assert len(nasa.requests) == 1


def test_overlapping_range_only_fetches_missing_days(client, nasa, user):
    history(client, user, "2026-10-01", "2026-10-10")
    history(client, user, "2026-10-05", "2026-10-15")
    assert nasa.ranges() == [("20261001", "20261010"), ("20261011", "20261015")]


def test_nearby_points_share_cached_days(client, nasa, user):
    history(client, user, lat=32.2226, lon=-110.9747)
    history(client, user, lat=32.2241, lon=-110.9712)  # same 0.01° cell
    assert len(nasa.requests) == 1


def test_recent_days_are_refreshed_but_settled_history_is_not(client, nasa, user, monkeypatch):
    history(client, user, "2026-11-01", "2026-11-20")
    # 13 hours later (now Nov 25): the last 14 days may have been revised, older days are final.
    monkeypatch.setattr(weather, "utcnow", lambda: NOW + timedelta(hours=13))
    history(client, user, "2026-11-01", "2026-11-20")
    assert nasa.ranges()[1] == ("20261111", "20261120")


def test_missing_recent_values_are_retried_sooner(client, nasa, user, monkeypatch):
    nasa.rain = lambda d: None if d >= date(2026, 11, 21) else 1.0  # not yet published
    history(client, user, "2026-11-15", "2026-11-23")
    monkeypatch.setattr(weather, "utcnow", lambda: NOW + timedelta(hours=1))
    history(client, user, "2026-11-15", "2026-11-23")
    assert len(nasa.requests) == 1  # too soon
    monkeypatch.setattr(weather, "utcnow", lambda: NOW + timedelta(hours=4))
    history(client, user, "2026-11-15", "2026-11-23")
    assert nasa.ranges()[1] == ("20261121", "20261123")


def test_failed_request_is_not_cached(client, nasa, user):
    nasa.failures = ["garbage"]
    assert history(client, user).status_code == 502
    assert history(client, user).status_code == 200
    assert len(nasa.requests) == 2


def test_saved_data_is_served_as_stale_when_nasa_is_down(client, nasa, user, monkeypatch):
    farm = make_farm(client, user)
    assert client.get(f"/api/v1/farms/{farm['id']}/weather/summary", headers=user).status_code == 200
    monkeypatch.setattr(weather, "utcnow", lambda: NOW + timedelta(days=1))  # recent days need refresh
    nasa.failures = [503, 503, 503]
    r = client.get(f"/api/v1/farms/{farm['id']}/weather/summary", headers=user)
    assert r.status_code == 200
    fresh = r.json()["freshness"]
    assert fresh["stale"] is True
    assert "could not be reached, so saved data is shown" in fresh["warning"]


# ------------------------------------------------------------------ summaries & association


def test_farm_summary_totals_windows_and_freshness(client, nasa, user):
    # 2 mm every day, except the last 3 days which NASA hasn't published yet.
    nasa.rain = lambda d: None if d > date(2026, 11, 20) else 2.0
    farm = make_farm(client, user)
    r = client.get(f"/api/v1/farms/{farm['id']}/weather/summary", headers=user)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["target"] == {"kind": "farm", "id": farm["id"], "name": "Test", "basis": "the farm's location"}
    assert s["requested_range"] == {"start": "2026-10-10", "end": "2026-11-23"}  # 45 days ending yesterday
    assert s["units"] == {"precipitation": "mm", "temperature": "°C"}
    assert (
        s["source"]["name"] == "NASA POWER"
        and "Not a measurement taken in your field" in s["source"]["description"]
    )
    assert s["freshness"]["latest_observation_date"] == "2026-11-20"
    assert s["freshness"]["days_since_latest"] == 4
    assert s["freshness"]["status"] == "current"
    # Windows end on the newest published day, so delayed days don't count as dry.
    assert s["precipitation"]["last_7_days"] == {
        "start": "2026-11-14",
        "end": "2026-11-20",
        "expected_days": 7,
        "valid_days": 7,
        "total_mm": 14.0,
        "complete": True,
    }
    assert s["precipitation"]["last_30_days"]["total_mm"] == 60.0
    assert s["precipitation"]["last_30_days"]["start"] == "2026-10-22"
    assert s["temperature"] == {
        "mean_c": 15.0,
        "lowest_c": 10.0,
        "highest_c": 20.0,
        "valid_days": 30,
        "expected_days": 30,
    }
    assert s["alerts"] == []
    assert [c["status"] for c in s["checks"]] == ["not_triggered", "not_triggered"]


def test_field_summary_uses_the_field_centre_not_the_farm_point(client, nasa, user):
    farm = make_farm(client, user, lat=40.0, lon=-100.0)  # far from the field
    field = client.post(
        f"/api/v1/farms/{farm['id']}/fields", headers=user, json={"name": "F", "boundary": SQUARE}
    ).json()
    r = client.get(f"/api/v1/fields/{field['id']}/weather/summary", headers=user)
    assert r.status_code == 200, r.text
    assert r.json()["target"]["kind"] == "field"
    assert r.json()["location"] == {"latitude": 32.21, "longitude": -110.97}
    params = nasa.requests[-1].url.params
    assert (params["latitude"], params["longitude"]) == ("32.21", "-110.97")


def test_weather_is_owner_only_and_never_fetched_for_strangers(client, nasa, user):
    farm = make_farm(client, user)
    field = client.post(
        f"/api/v1/farms/{farm['id']}/fields", headers=user, json={"name": "F", "boundary": SQUARE}
    ).json()
    stranger = register(client, "stranger@example.com")
    for url in (
        f"/api/v1/farms/{farm['id']}/weather/summary",
        f"/api/v1/fields/{field['id']}/weather/summary",
        f"/api/v1/farms/{farm['id']}/alerts",
    ):
        assert client.get(url, headers=stranger).status_code == 404
        assert client.get(url).status_code == 401
    assert nasa.requests == []


def test_summary_with_no_data_at_all(client, nasa, user):
    nasa.rain = lambda d: None
    nasa.temp = lambda d: None
    farm = make_farm(client, user)
    s = client.get(f"/api/v1/farms/{farm['id']}/weather/summary", headers=user).json()
    assert s["freshness"]["status"] == "no_data"
    assert s["precipitation"] is None and s["temperature"] is None
    assert s["alerts"] == []
    assert {c["status"] for c in s["checks"]} == {"insufficient_data"}


# ------------------------------------------------------------------ calculations & rules (pure)


def series_from(rain: dict[date, float | None], temp: float | None = 10.0) -> Series:
    return Series(0, 0, [Day(d, r, temp, temp, temp, NOW) for d, r in sorted(rain.items())], False, None)


def days_back(end: date, n: int, value: float | None) -> dict[date, float | None]:
    return {end - timedelta(i): value for i in range(n)}


def test_missing_days_are_excluded_from_totals_and_reported():
    end = date(2026, 11, 20)
    rain = days_back(end, 30, 1.0) | {end - timedelta(2): None, end - timedelta(10): None}
    s = summarize(series_from(rain), TODAY)
    assert s["precipitation"]["last_7_days"]["total_mm"] == 6.0
    assert s["precipitation"]["last_7_days"]["valid_days"] == 6
    assert s["precipitation"]["last_7_days"]["complete"] is False
    assert s["precipitation"]["last_30_days"]["total_mm"] == 28.0


def test_data_older_than_a_week_is_flagged_as_delayed():
    s = summarize(series_from(days_back(date(2026, 11, 10), 30, 1.0)), TODAY)
    assert s["freshness"]["days_since_latest"] == 14
    assert s["freshness"]["status"] == "delayed"


def test_low_7_day_rainfall_triggers_with_evidence_and_limitations():
    end = date(2026, 11, 20)
    rain = days_back(end, 30, 5.0) | days_back(end, 7, 0.2)
    s = summarize(series_from(rain), TODAY)
    [alert] = s["alerts"]
    assert alert["code"] == "LOW_RAINFALL_7D"
    assert alert["evidence"] == {
        "rainfall_mm": 1.4,
        "threshold_mm": 2.0,
        "window_start": date(2026, 11, 14),
        "window_end": end,
        "valid_days": 7,
        "expected_days": 7,
    }
    assert (
        alert["explanation"]
        == "1.4 mm of rain was estimated for Nov 14, 2026 to Nov 20, 2026 (all days had data). This rule triggers below 2 mm."
    )
    assert "does not measure soil moisture" in alert["limitations"]
    assert "not a drought classification" in alert["limitations"]
    assert "drought" not in alert["title"].lower()


def test_low_30_day_rainfall_rule():
    s = summarize(series_from(days_back(date(2026, 11, 20), 30, 0.25)), TODAY)
    assert [a["code"] for a in s["alerts"]] == ["LOW_RAINFALL_7D", "LOW_RAINFALL_30D"]
    assert s["alerts"][1]["evidence"]["rainfall_mm"] == 7.5


def test_30_day_rule_alone_when_last_week_was_wetter():
    end = date(2026, 11, 20)
    s = summarize(
        series_from(days_back(end, 30, 0.1) | days_back(end, 7, 1.0)), TODAY
    )  # 7 mm/week, 9.3 mm/month
    assert [a["code"] for a in s["alerts"]] == ["LOW_RAINFALL_30D"]


def test_rules_do_not_judge_when_data_is_insufficient():
    end = date(2026, 11, 20)
    rain = days_back(end, 30, 0.0) | {end - timedelta(i): None for i in range(1, 3)}  # 5 of 7 valid
    checks = {c["code"]: c for c in summarize(series_from(rain), TODAY)["checks"]}
    assert checks["LOW_RAINFALL_7D"]["status"] == "insufficient_data"
    assert (
        checks["LOW_RAINFALL_7D"]["explanation"]
        == "Not checked: only 5 of 7 days have rainfall data (needs 6)."
    )
    assert checks["LOW_RAINFALL_30D"]["status"] == "triggered"  # 28 of 30 valid is enough


def test_rule_boundary_is_strictly_below_threshold():
    window = {"start": date(2026, 11, 14), "end": date(2026, 11, 20), "valid_days": 7, "complete": True}
    at = evaluate_rainfall_rules({"last_7_days": {**window, "total_mm": 2.0}}, RAINFALL_RULES[:1])
    below = evaluate_rainfall_rules({"last_7_days": {**window, "total_mm": 1.99}}, RAINFALL_RULES[:1])
    assert at[0]["status"] == "not_triggered" and at[0]["alert"] is None
    assert below[0]["status"] == "triggered"


def test_legacy_alerts_endpoint_keeps_its_shape(client, nasa, user):
    nasa.rain = lambda d: 0.0
    farm = make_farm(client, user)
    body = client.get(f"/api/v1/farms/{farm['id']}/alerts", headers=user).json()
    assert body["source"] == "NASA POWER"
    assert {a["kind"] for a in body["alerts"]} == {"low_rainfall_7d", "low_rainfall_30d"}
    assert all(set(a) == {"kind", "title", "details", "observed_on"} for a in body["alerts"])


def test_cached_summary_uses_a_fixed_small_number_of_queries(client, nasa, user, engine):
    """Regression: reading ORM rows after rollback() refreshed each row separately
    (45 round trips, ~2.3 s per request against Supabase)."""
    farm = make_farm(client, user)
    url = f"/api/v1/farms/{farm['id']}/weather/summary"
    assert client.get(url, headers=user).status_code == 200  # warm the cache
    statements: list[str] = []

    def count(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        assert client.get(url, headers=user).status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert len(nasa.requests) == 1
    observation_queries = [s for s in statements if "weather_observations" in s]
    assert len(observation_queries) == 1, observation_queries
    assert len(statements) <= 4, statements  # user, farm, one observation range read

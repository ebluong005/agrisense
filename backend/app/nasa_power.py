"""NASA POWER daily point API adapter: request, retries, parsing. No caching, no HTTP-layer errors.

https://power.larc.nasa.gov/docs/services/api/temporal/daily/
"""

import random
import time
from dataclasses import dataclass
from datetime import date, datetime

import httpx

from .config import get_settings

SOURCE_NAME = "NASA POWER"
# Precipitation corrected (mm/day), 2 m air temperature mean/min/max (°C).
PARAMETERS = ("PRECTOTCORR", "T2M", "T2M_MIN", "T2M_MAX")
DEFAULT_FILL_VALUE = -999.0
FIRST_AVAILABLE_DATE = date(1981, 1, 1)

TIMEOUT = httpx.Timeout(30.0, connect=10.0)
MAX_ATTEMPTS = 3
BACKOFF_SECONDS = (0.5, 1.5)  # before attempts 2 and 3, plus jitter
RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# Test seams: replace the transport with httpx.MockTransport and sleep with a no-op.
transport: httpx.BaseTransport | None = None
sleep = time.sleep


class ProviderError(Exception):
    """Base class; `message` is safe to show to users."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class ProviderTimeout(ProviderError):
    pass


class ProviderUnavailable(ProviderError):
    pass


class ProviderInvalidResponse(ProviderError):
    pass


@dataclass(frozen=True)
class DailyValues:
    day: date
    precipitation_mm: float | None
    temperature_c: float | None
    temperature_min_c: float | None
    temperature_max_c: float | None


def fetch_daily(latitude: float, longitude: float, start: date, end: date) -> list[DailyValues]:
    """Fetch [start, end] for one point. Retries timeouts, network errors and 429/5xx with backoff."""
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "latitude": latitude,
        "longitude": longitude,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    last_error: ProviderError = ProviderUnavailable(f"{SOURCE_NAME} is temporarily unavailable.")
    with httpx.Client(timeout=TIMEOUT, transport=transport) as client:
        for attempt in range(MAX_ATTEMPTS):
            if attempt:
                sleep(BACKOFF_SECONDS[attempt - 1] + random.uniform(0, 0.25))
            try:
                response = client.get(get_settings().nasa_power_url, params=params)
            except httpx.TimeoutException:
                last_error = ProviderTimeout(f"{SOURCE_NAME} took too long to respond.")
                continue
            except httpx.TransportError:
                last_error = ProviderUnavailable(f"{SOURCE_NAME} could not be reached.")
                continue
            if response.status_code in RETRYABLE_STATUS:
                last_error = ProviderUnavailable(f"{SOURCE_NAME} is temporarily unavailable.")
                continue
            if response.status_code >= 400:  # our request was rejected: retrying won't help
                raise ProviderInvalidResponse(
                    f"{SOURCE_NAME} rejected the request (HTTP {response.status_code})."
                )
            return parse_response(response)
    raise last_error


def parse_response(response: httpx.Response) -> list[DailyValues]:
    try:
        payload = response.json()
        parameters = payload["properties"]["parameter"]
        fill = float(payload.get("header", {}).get("fill_value", DEFAULT_FILL_VALUE))
        series = {name: parameters.get(name, {}) for name in PARAMETERS}
        if not series["PRECTOTCORR"] and not series["T2M"]:
            raise ValueError("no precipitation or temperature series")
        days = sorted(set().union(*(s.keys() for s in series.values())))
        return [
            DailyValues(
                day=datetime.strptime(key, "%Y%m%d").date(),
                precipitation_mm=_value(series["PRECTOTCORR"].get(key), fill),
                temperature_c=_value(series["T2M"].get(key), fill),
                temperature_min_c=_value(series["T2M_MIN"].get(key), fill),
                temperature_max_c=_value(series["T2M_MAX"].get(key), fill),
            )
            for key in days
        ]
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ProviderInvalidResponse(f"{SOURCE_NAME} returned data that could not be read.") from exc


def _value(raw: object, fill: float) -> float | None:
    """Provider fill values (-999) and anything non-numeric become None, never 0."""
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        return None
    value = float(raw)
    if value == fill or value <= -900:
        return None
    return value

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# Email validation is implemented without optional email-validator dependency.
class Register(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=10, max_length=128)


class Login(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class FarmIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class FarmOut(FarmIn):
    id: int
    owner_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FieldIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    crop_type: str = Field(default="Unknown", max_length=80)
    planting_date: date | None = None
    boundary: dict[str, Any]


class FieldOut(BaseModel):
    id: int
    farm_id: int
    name: str
    crop_type: str
    planting_date: str | None
    boundary: dict[str, Any]
    area_hectares: float
    model_config = ConfigDict(from_attributes=True)


class DailyWeather(BaseModel):
    date: date
    temperature_c: float | None = None
    precipitation_mm: float | None = None


class WeatherResponse(BaseModel):
    latitude: float
    longitude: float
    source: str
    daily: list[DailyWeather]


class AlertOut(BaseModel):
    kind: str
    title: str
    details: str
    observed_on: str


class NDVIPoint(BaseModel):
    date: str
    mean_ndvi: float
    source: str


# ---- Weather summary (GET /farms/{id}/weather/summary, /fields/{id}/weather/summary) ----


class WeatherTarget(BaseModel):
    kind: Literal["farm", "field"]
    id: int
    name: str
    basis: str  # which point the weather is estimated for


class WeatherSource(BaseModel):
    name: str
    url: str
    dataset: str
    parameters: dict[str, str]
    spatial_resolution: str
    description: str


class Freshness(BaseModel):
    status: Literal["current", "delayed", "no_data"]
    latest_observation_date: date | None
    days_since_latest: int | None
    retrieved_at: datetime | None
    stale: bool  # provider unreachable: saved data shown
    warning: str | None


class RainfallWindow(BaseModel):
    start: date
    end: date
    expected_days: int
    valid_days: int
    total_mm: float | None  # null when no valid days: never a fake 0
    complete: bool


class PrecipitationTotals(BaseModel):
    last_7_days: RainfallWindow
    last_30_days: RainfallWindow


class TemperatureSummary(BaseModel):
    mean_c: float | None
    lowest_c: float | None
    highest_c: float | None
    valid_days: int
    expected_days: int


class AlertEvidence(BaseModel):
    rainfall_mm: float
    threshold_mm: float
    window_start: date
    window_end: date
    valid_days: int
    expected_days: int


class WeatherAlert(BaseModel):
    code: str
    severity: Literal["watch"]
    title: str
    explanation: str
    evidence: AlertEvidence
    limitations: str
    suggested_action: str
    source: str


class RuleCheck(BaseModel):
    code: str
    status: Literal["triggered", "not_triggered", "insufficient_data"]
    threshold_mm: float
    window_days: int
    explanation: str


class DailyObservation(BaseModel):
    date: date
    precipitation_mm: float | None
    temperature_c: float | None
    temperature_min_c: float | None
    temperature_max_c: float | None


class DateRange(BaseModel):
    start: date
    end: date


class Point(BaseModel):
    latitude: float
    longitude: float


class WeatherSummary(BaseModel):
    target: WeatherTarget
    location: Point
    requested_range: DateRange
    source: WeatherSource
    units: dict[str, str]
    freshness: Freshness
    precipitation: PrecipitationTotals | None
    temperature: TemperatureSummary | None
    alerts: list[WeatherAlert]
    checks: list[RuleCheck]
    daily: list[DailyObservation]

from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now():
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    farms: Mapped[list["Farm"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Farm(Base):
    __tablename__ = "farms"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    owner: Mapped[User] = relationship(back_populates="farms")
    fields: Mapped[list["Field"]] = relationship(back_populates="farm", cascade="all, delete-orphan")


class Field(Base):
    __tablename__ = "fields"
    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    crop_type: Mapped[str] = mapped_column(String(80), default="Unknown")
    planting_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    boundary: Mapped[dict] = mapped_column(JSON)  # GeoJSON Polygon; validated by Shapely
    area_hectares: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    farm: Mapped[Farm] = relationship(back_populates="fields")


class WeatherCache(Base):
    __tablename__ = "weather_cache"
    id: Mapped[int] = mapped_column(primary_key=True)
    cache_key: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    data: Mapped[dict] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class WeatherObservation(Base):
    """One provider day at one (rounded) location. Shared by every farm/field in that spot.

    Null values mean the provider had no valid measurement (never stored as 0).
    """

    __tablename__ = "weather_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(40))
    location_key: Mapped[str] = mapped_column(String(40))
    observed_on: Mapped[date] = mapped_column(Date)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_min_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_max_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        # Also serves range queries: WHERE provider = ? AND location_key = ? AND observed_on BETWEEN ...
        UniqueConstraint("provider", "location_key", "observed_on", name="uq_weather_observation_day"),
    )


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id"), index=True)
    kind: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(160))
    details: Mapped[str] = mapped_column(String(1000))
    observed_on: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (UniqueConstraint("field_id", "kind", "observed_on", name="uq_field_alert_day"),)


class NDVIObservation(Base):
    __tablename__ = "ndvi_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id"), index=True)
    observed_on: Mapped[str] = mapped_column(String(10))
    mean_ndvi: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(120), default="Copernicus Sentinel-2 L2A")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (UniqueConstraint("field_id", "observed_on", name="uq_ndvi_observation"),)

"""Validated application settings loaded from the environment or backend/.env."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_DEV_JWT_SECRET = "CHANGE_ME_LOCAL_DEVELOPMENT_ONLY"


def normalize_database_url(url: str) -> str:
    """Make provider-style URLs use the installed psycopg (v3) driver.

    Supabase's Connect dialog shows ``postgresql://...`` and some hosts use
    ``postgres://...``. Without an explicit driver SQLAlchemy would try psycopg2,
    which is not a dependency of this project.
    """
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class Settings(BaseSettings):
    app_env: Literal["local", "test", "staging", "production"] = "local"
    # SQLite is a zero-setup fallback for local demos and unit tests only.
    # Supabase Postgres/PostGIS is the target for every shared environment.
    database_url: str = "sqlite:///./agrisense.db"
    # Optional separate URL for Alembic (Supabase direct or session-pooler
    # connection). Falls back to database_url when empty.
    database_migration_url: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 2
    jwt_secret: str = LOCAL_DEV_JWT_SECRET
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Optional full-match regex for origins that change per deploy (Vercel preview URLs),
    # e.g. ^https://agrisense-[a-z0-9-]+-myteam\.vercel\.app$ . Keep it anchored and specific.
    cors_origin_regex: str = ""
    # NASA POWER daily point API. Overridable so browser tests can use a local fake.
    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    copernicus_client_id: str = ""
    copernicus_client_secret: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        self.database_url = normalize_database_url(self.database_url)
        self.database_migration_url = normalize_database_url(self.database_migration_url or self.database_url)
        if self.app_env in ("staging", "production"):
            if self.jwt_secret == LOCAL_DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError(
                    "JWT_SECRET must be set to a random value of at least 32 characters "
                    "when APP_ENV is staging or production"
                )
            if self.database_url.startswith("sqlite"):
                raise ValueError("SQLite is not allowed when APP_ENV is staging or production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

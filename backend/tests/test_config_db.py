"""Settings validation, engine configuration, readiness and migration checks."""

import os

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from helpers import alembic_config
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from alembic import command
from app import main
from app.config import LOCAL_DEV_JWT_SECRET, Settings, normalize_database_url
from app.database import Base, build_engine, engine_options, get_db, redact_url


@pytest.fixture(autouse=True)
def _isolated_settings_env(monkeypatch):
    """Settings read the process environment; CI/deploy shells may export these."""
    for name in (
        "APP_ENV",
        "DATABASE_URL",
        "DATABASE_MIGRATION_URL",
        "JWT_SECRET",
        "CORS_ORIGINS",
        "CORS_ORIGIN_REGEX",
    ):
        monkeypatch.delenv(name, raising=False)


SUPABASE_STYLE = (
    "postgresql://postgres.abcd:s3cret-pw@aws-0-us-west-1.pooler.supabase.com:{port}/postgres?sslmode=require"
)


@pytest.mark.parametrize("prefix", ["postgres://", "postgresql://"])
def test_provider_urls_use_psycopg3_driver(prefix):
    assert normalize_database_url(prefix + "u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"


def test_sqlite_and_explicit_driver_urls_unchanged():
    for url in ("sqlite:///./agrisense.db", "postgresql+psycopg://u:p@h/db"):
        assert normalize_database_url(url) == url


def test_migration_url_defaults_to_database_url():
    s = Settings(_env_file=None, database_url=SUPABASE_STYLE.format(port=5432))
    assert s.database_migration_url == s.database_url
    assert s.database_url.startswith("postgresql+psycopg://")


@pytest.mark.parametrize("env", ["staging", "production"])
def test_deployed_env_rejects_default_or_short_jwt_secret(env):
    pg = SUPABASE_STYLE.format(port=5432)
    for secret in (LOCAL_DEV_JWT_SECRET, "too-short"):
        with pytest.raises(ValidationError, match="JWT_SECRET"):
            Settings(_env_file=None, app_env=env, database_url=pg, jwt_secret=secret)


def test_deployed_env_rejects_sqlite():
    with pytest.raises(ValidationError, match="SQLite"):
        Settings(_env_file=None, app_env="production", jwt_secret="x" * 40, database_url="sqlite:///x.db")


def test_redact_url_hides_password():
    shown = redact_url(normalize_database_url(SUPABASE_STYLE.format(port=5432)))
    assert "s3cret-pw" not in shown and "***" in shown


@pytest.mark.parametrize(("port", "prepare"), [(6543, None), (5432, "absent")])
def test_transaction_pooler_disables_prepared_statements(port, prepare):
    url = normalize_database_url(SUPABASE_STYLE.format(port=port))
    options = engine_options(url)
    assert options["connect_args"].get("prepare_threshold", "absent") == prepare
    assert options["pool_pre_ping"] is True
    # create_engine does not connect, so building one makes no network call.
    assert build_engine(url).pool.size() == 5
    assert "poolclass" in engine_options(url, null_pool=True)


def test_ready_ok(client):
    assert client.get("/ready").json() == {"status": "ready"}


def test_ready_returns_503_when_db_unreachable(client):
    class UnreachableSession:
        def execute(self, *args, **kwargs):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    main.app.dependency_overrides[get_db] = lambda: UnreachableSession()
    r = client.get("/ready")
    assert r.status_code == 503
    assert r.json() == {"detail": "Database unavailable"}


def test_migrations_upgrade_match_models_and_downgrade(tmp_path):
    """Migrations, not create_all, must produce exactly the ORM schema."""
    url = f"sqlite:///{tmp_path / 'migrate.db'}"
    cfg = alembic_config(url)
    command.upgrade(cfg, "head")
    engine = build_engine(url, null_pool=True)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == [], f"Models and migrations differ: {diff}"
    command.downgrade(cfg, "base")
    with engine.connect() as conn:
        assert MigrationContext.configure(conn).get_current_revision() is None
    command.upgrade(cfg, "head")
    engine.dispose()


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs TEST_DATABASE_URL (PostgreSQL)")
def test_every_table_has_rls_and_no_data_api_access(postgres_engine):
    """Guard for future migrations: Supabase exposes public tables to the Data API."""
    with postgres_engine.connect() as conn:
        rls = dict(
            conn.execute(
                text(
                    "SELECT c.relname, c.relrowsecurity FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = 'public' AND c.relkind = 'r'"
                )
            ).all()
        )
        expected = {t.name for t in Base.metadata.sorted_tables} | {"alembic_version"}
        assert expected <= rls.keys()
        assert [t for t in expected if not rls[t]] == [], "tables without RLS"
        roles = conn.execute(
            text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
        ).scalars()
        for role in roles:
            for table in expected:
                for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                    assert not conn.execute(
                        text("SELECT has_table_privilege(:r, :t, :p)"),
                        {"r": role, "t": f"public.{table}", "p": priv},
                    ).scalar(), f"{role} has {priv} on {table}"


def test_cors_allows_listed_and_preview_origins_only():
    """Vercel previews get a new URL per deploy; a narrow regex admits them, nothing else."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.get("/api/v1/farms")(lambda: [])
    settings = Settings(
        _env_file=None,
        cors_origins="https://agrisense.example.com",
        cors_origin_regex=r"^https://agrisense-[a-z0-9-]+-team\.vercel\.app$",
    )
    main.add_cors(app, settings)
    client = TestClient(app)

    def allowed(origin: str) -> str | None:
        r = client.options(
            "/api/v1/farms", headers={"Origin": origin, "Access-Control-Request-Method": "GET"}
        )
        return r.headers.get("access-control-allow-origin")

    assert allowed("https://agrisense.example.com") == "https://agrisense.example.com"
    assert (
        allowed("https://agrisense-git-feature-x-team.vercel.app")
        == "https://agrisense-git-feature-x-team.vercel.app"
    )
    assert allowed("https://evil.example.com") is None
    assert allowed("https://agrisense-x-team.vercel.app.evil.com") is None

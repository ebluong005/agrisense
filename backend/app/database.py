"""SQLAlchemy engine and session setup for SQLite (local/tests) and Supabase Postgres."""

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

# Supabase's transaction pooler (Supavisor) listens on 6543 and does not support
# server-side prepared statements, which psycopg 3 uses automatically.
SUPABASE_TRANSACTION_POOLER_PORT = 6543


def redact_url(url: str) -> str:
    """Render a database URL with the password hidden, safe for logs and CLI output."""
    return make_url(url).render_as_string(hide_password=True)


def engine_options(url: str, pool_size: int = 5, max_overflow: int = 2, null_pool: bool = False) -> dict:
    """Keyword arguments for ``create_engine``, chosen from the URL."""
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite":
        options: dict = {"connect_args": {"check_same_thread": False}}
        if null_pool:
            options["poolclass"] = NullPool
        return options
    connect_args: dict = {"connect_timeout": 10}
    if parsed.port == SUPABASE_TRANSACTION_POOLER_PORT:
        connect_args["prepare_threshold"] = None
    if null_pool:
        return {"connect_args": connect_args, "poolclass": NullPool}
    return {
        "connect_args": connect_args,
        "pool_pre_ping": True,  # survive idle connections closed by the pooler
        "pool_size": pool_size,  # keep well under Supabase's connection limits
        "max_overflow": max_overflow,
        "pool_recycle": 1800,
    }


def build_engine(url: str, pool_size: int = 5, max_overflow: int = 2, null_pool: bool = False) -> Engine:
    """Create an engine. ``null_pool`` is for one-shot tools such as Alembic."""
    return create_engine(url, **engine_options(url, pool_size, max_overflow, null_pool))


_settings = get_settings()
engine = build_engine(_settings.database_url, _settings.db_pool_size, _settings.db_max_overflow)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as session:
        yield session

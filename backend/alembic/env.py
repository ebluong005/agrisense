"""Alembic environment.

Uses DATABASE_MIGRATION_URL when set (recommended for Supabase: the direct or
session-pooler connection), otherwise DATABASE_URL. Never put credentials in
alembic.ini.
"""

from logging.config import fileConfig

from alembic import context
from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import get_settings
from app.database import Base, build_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata
# Programmatic callers (the test suite) may pass an explicit URL.
MIGRATION_URL = config.attributes.get("database_url") or get_settings().database_migration_url


# Tables owned by extensions (PostGIS) are visible via Supabase's search_path
# but are not ours. Without this filter, autogenerate would propose DROPPING them.
EXTENSION_TABLES = {
    "spatial_ref_sys",
    "geometry_columns",
    "geography_columns",
    "raster_columns",
    "raster_overviews",
}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and reflected and compare_to is None and name in EXTENSION_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=MIGRATION_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        include_object=include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # One short-lived, unpooled connection for the migration run.
    engine = build_engine(MIGRATION_URL, null_pool=True)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

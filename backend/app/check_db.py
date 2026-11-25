"""Verify database connectivity, PostGIS and migration state.

Usage (from backend/):  python -m app.check_db

Prints the target with the password redacted. Never prints credentials.
Exit code 0 = connected and migrated to head; 1 = something needs attention.
"""

import sys
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .database import build_engine, redact_url


def main() -> int:
    settings = get_settings()
    print(f"APP_ENV:      {settings.app_env}")
    print(f"Database:     {redact_url(settings.database_url)}")
    engine = build_engine(settings.database_url, null_pool=True)
    ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            print("Connection:   OK")
            if conn.dialect.name == "postgresql":
                print(f"Server:       {conn.execute(text('SHOW server_version')).scalar()}")
                row = conn.execute(
                    text(
                        "SELECT extversion, extnamespace::regnamespace::text "
                        "FROM pg_extension WHERE extname = 'postgis'"
                    )
                ).first()
                if row:
                    print(f"PostGIS:      {row[0]} (schema: {row[1]})")
                else:
                    ok = False
                    print("PostGIS:      NOT ENABLED. Enable it in Supabase (see DEPLOYMENT_GUIDE.md)")
            else:
                print(f"Dialect:      {conn.dialect.name} (PostGIS not applicable; local/test only)")
            current = MigrationContext.configure(conn).get_current_revision()
    except SQLAlchemyError as exc:
        # The exception class name is enough to diagnose; the message can echo the host.
        print(f"Connection:   FAILED ({type(exc).__name__}). Check host, port, password, sslmode")
        return 1
    finally:
        engine.dispose()

    backend_dir = Path(__file__).resolve().parents[1]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    print(f"Migration:    current={current or 'none'} head={head}")
    if current != head:
        ok = False
        print("              Run: python -m alembic upgrade head")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

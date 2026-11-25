"""Lock application tables away from Supabase's public Data API.

Revision ID: 0002_enable_rls
Revises: 0001_initial
Create Date: 2026-11-24

Supabase automatically exposes tables in the ``public`` schema through its REST
and GraphQL Data API. Requests made with the browser-visible publishable key run
as the ``anon`` role (or ``authenticated`` once a user signs in). All AgriSense
data access goes through FastAPI, so this migration:

1. Enables Row Level Security with **no policies** on every application table,
   which denies every row to the Data API roles.
2. Revokes all privileges from ``anon`` and ``authenticated`` on those tables
   (defense in depth), when those roles exist (Supabase only).

FastAPI connects as the table owner (``postgres``), and the owner is not
subject to RLS unless FORCE is set, so the API is unaffected.

Every future migration that creates a table must do the same.
``tests/test_config_db.py`` checks this in PostgreSQL integration mode.
No-op on SQLite.
"""

from alembic import op

revision = "0002_enable_rls"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

TABLES = (
    "users",
    "farms",
    "fields",
    "weather_cache",
    "alerts",
    "ndvi_observations",
    "alembic_version",
)
DATA_API_ROLES = ("anon", "authenticated")


def _existing_roles() -> list[str]:
    rows = op.get_bind().exec_driver_sql(
        "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')"
    )
    return [r[0] for r in rows]


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    roles = _existing_roles()
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
        for role in roles:
            op.execute(f'REVOKE ALL ON TABLE public."{table}" FROM "{role}"')


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    # Grants to anon/authenticated are intentionally NOT restored: re-exposing
    # user data through the Data API should never be an automatic side effect.
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')

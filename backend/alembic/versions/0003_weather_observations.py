"""Per-day weather observation cache (replaces whole-response caching).

Revision ID: 0003_weather_observations
Revises: 0002_enable_rls
Create Date: 2026-11-24

The old `weather_cache` table is left in place (unused) and can be dropped in a
later migration once no deployed code reads it.
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_weather_observations"
down_revision = "0002_enable_rls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_observations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("location_key", sa.String(length=40), nullable=False),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("precipitation_mm", sa.Float(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("temperature_min_c", sa.Float(), nullable=True),
        sa.Column("temperature_max_c", sa.Float(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "location_key", "observed_on", name="uq_weather_observation_day"),
    )
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Same rule as 0002: no Supabase Data API access to app tables.
        op.execute('ALTER TABLE public."weather_observations" ENABLE ROW LEVEL SECURITY')
        roles = bind.exec_driver_sql(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')"
        )
        for (role,) in roles:
            op.execute(f'REVOKE ALL ON TABLE public."weather_observations" FROM "{role}"')


def downgrade() -> None:
    op.drop_table("weather_observations")

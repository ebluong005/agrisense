"""Initial schema: users, farms, fields, weather cache, alerts, NDVI observations.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-24

Explicit operations replace the earlier ``Base.metadata.create_all()`` version
of this revision. The resulting schema is identical, but it no longer changes
silently when the ORM models change.

Field boundaries are GeoJSON stored in a JSON column. Moving them to a PostGIS
geometry column is a separate, later migration.
"""

import sqlalchemy as sa

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "weather_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cache_key", sa.String(length=180), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weather_cache_cache_key", "weather_cache", ["cache_key"], unique=True)

    op.create_table(
        "farms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_farms_owner_id", "farms", ["owner_id"])

    op.create_table(
        "fields",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("farm_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("crop_type", sa.String(length=80), nullable=False),
        sa.Column("planting_date", sa.String(length=10), nullable=True),
        sa.Column("boundary", sa.JSON(), nullable=False),
        sa.Column("area_hectares", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fields_farm_id", "fields", ["farm_id"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("details", sa.String(length=1000), nullable=False),
        sa.Column("observed_on", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["fields.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("field_id", "kind", "observed_on", name="uq_field_alert_day"),
    )
    op.create_index("ix_alerts_field_id", "alerts", ["field_id"])

    op.create_table(
        "ndvi_observations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("observed_on", sa.String(length=10), nullable=False),
        sa.Column("mean_ndvi", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["field_id"], ["fields.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("field_id", "observed_on", name="uq_ndvi_observation"),
    )
    op.create_index("ix_ndvi_observations_field_id", "ndvi_observations", ["field_id"])


def downgrade() -> None:
    # Reverse dependency order. Destructive: never run against production data
    # without a verified backup.
    op.drop_index("ix_ndvi_observations_field_id", table_name="ndvi_observations")
    op.drop_table("ndvi_observations")
    op.drop_index("ix_alerts_field_id", table_name="alerts")
    op.drop_table("alerts")
    op.drop_index("ix_fields_farm_id", table_name="fields")
    op.drop_table("fields")
    op.drop_index("ix_farms_owner_id", table_name="farms")
    op.drop_table("farms")
    op.drop_index("ix_weather_cache_cache_key", table_name="weather_cache")
    op.drop_table("weather_cache")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

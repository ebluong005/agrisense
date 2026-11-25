"""Shared fixtures.

Default: each test gets a fresh in-memory SQLite database (fast, no setup).

Integration mode: set TEST_DATABASE_URL to an *isolated, disposable* PostgreSQL
database whose name contains "test". The schema is built with Alembic, and every
table is truncated between tests. Never point this at a database holding real data.
"""

import os

import pytest
from fastapi.testclient import TestClient
from helpers import alembic_config
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from alembic import command
from app.config import normalize_database_url
from app.database import Base, build_engine, get_db
from app.main import app

TEST_DATABASE_URL = normalize_database_url(os.environ.get("TEST_DATABASE_URL", ""))


@pytest.fixture(scope="session")
def postgres_engine():
    if not TEST_DATABASE_URL:
        yield None
        return
    name = make_url(TEST_DATABASE_URL).database or ""
    if "test" not in name.lower():
        pytest.exit(f"Refusing to run destructive tests: database name {name!r} lacks 'test'")
    command.upgrade(alembic_config(TEST_DATABASE_URL), "head")
    engine = build_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def engine(postgres_engine):
    if postgres_engine is not None:
        yield postgres_engine
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        with postgres_engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        return
    eng = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine):
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def db():
        with Session() as session:
            yield session

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

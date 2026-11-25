"""Test helpers shared across test modules."""

import os

from alembic.config import Config

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def alembic_config(url: str) -> Config:
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = url
    return cfg


def register(client, email="user@example.com"):
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "example-password-123"})
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}

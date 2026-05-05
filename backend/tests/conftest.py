"""Pytest fixtures: spin up an in-memory SQLite + a TestClient with the
AI client and DB swapped for fakes.
"""
from __future__ import annotations
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-please-rotate-in-real-deploy-1234567890")
os.environ.setdefault("DB_HOST", "sqlite-memory")
os.environ.setdefault("ENVIRONMENT", "test")
# Tests use an in-memory SQLite — skip the production MySQL bootstrap.
os.environ["UKWI_SKIP_BOOTSTRAP"] = "1"

import io
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User, UserRole
from app.models.stage import ConstructionStage
from app.services import ai_client as ai_client_module


# In-memory SQLite shared across the connection.
TEST_DB_URL = "sqlite+pysqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # share one connection so :memory: tables persist across requests
)


@event.listens_for(test_engine, "connect")
def _enable_fk(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, future=True)


def _override_get_db() -> Iterator:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Stub the AI client so tests don't need a running ai_service.
class _FakeAIClient:
    base_url = "stub://ai"

    async def health(self):
        return {"status": "ok", "ready": True, "using_fallback": True}

    async def model_info(self):
        return {"model_version": "test-1.0", "input_size": 224, "num_classes": 7, "stages": [], "using_fallback": True}

    async def predict(self, image_bytes, filename="image.jpg"):
        return {
            "predicted_stage": "Site Clearing & Excavation",
            "predicted_stage_order": 1,
            "predicted_progress": 5.0,
            "confidence": 0.91,
            "model_version": "test-1.0",
            "processing_time_ms": 17,
            "raw_predictions": {"stage_1": 0.91, "stage_2": 0.05},
        }

    async def predict_batch(self, payload):
        return [await self.predict(b, name) for name, b in payload]


@pytest.fixture(scope="session", autouse=True)
def _patch_ai_client():
    fake = _FakeAIClient()
    ai_client_module.ai_client = fake
    # Patch the symbol already imported into the routers
    from app.api.v1 import ai as ai_router_module
    from app.api.v1 import system as system_router_module
    ai_router_module.ai_client = fake
    system_router_module.ai_client = fake
    yield


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    # Seed master construction stages — mirrors database/init.sql
    rows = [
        ("Site Clearing & Excavation", 1, 10.0, 8.0),
        ("Sub-base Preparation", 2, 25.0, 12.0),
        ("Base Layer / Concrete Slab", 3, 45.0, 25.0),
        ("Surface Finishing (Asphalt/Acrylic)", 4, 65.0, 22.0),
        ("Court Line Marking & Painting", 5, 80.0, 13.0),
        ("Hoops & Backboards Installation", 6, 92.0, 12.0),
        ("Fencing & Final Touches", 7, 100.0, 8.0),
    ]
    for name, order, pp, cp in rows:
        db.add(ConstructionStage(stage_name=name, stage_order=order, expected_progress_percentage=pp, expected_cost_percentage=cp))
    db.commit()
    yield db
    db.close()


@pytest.fixture(scope="function")
def client(db_session) -> TestClient:
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session) -> User:
    u = User(full_name="Admin Test", email="admin@test.example.com", password_hash=hash_password("Test12345!"), role=UserRole.admin, is_active=True)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def manager_user(db_session) -> User:
    u = User(full_name="PM Test", email="pm@test.example.com", password_hash=hash_password("Test12345!"), role=UserRole.project_manager, is_active=True)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers(client, admin_user):
    r = client.post("/api/auth/login", data={"username": admin_user.email, "password": "Test12345!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def manager_headers(client, manager_user):
    r = client.post("/api/auth/login", data={"username": manager_user.email, "password": "Test12345!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def png_bytes() -> bytes:
    """Tiny in-memory PNG so endpoints that validate images get something real."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(120, 90, 60)).save(buf, format="PNG")
    return buf.getvalue()

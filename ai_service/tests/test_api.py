import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import main


client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


def test_stages_listing():
    r = client.get("/stages")
    assert r.status_code == 200
    assert len(r.json()) == 7


def test_predict_endpoint(png_bytes):
    r = client.post("/predict", files={"file": ("test.png", png_bytes, "image/png")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "predicted_stage" in body
    assert 0 <= body["predicted_progress"] <= 100


def test_predict_with_no_file():
    r = client.post("/predict", files={"file": ("empty.png", b"", "image/png")})
    assert r.status_code == 400


def test_predict_batch(png_bytes):
    r = client.post(
        "/predict-batch",
        files=[
            ("files", ("a.png", png_bytes, "image/png")),
            ("files", ("b.png", png_bytes, "image/png")),
        ],
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_model_info():
    r = client.get("/model-info")
    assert r.status_code == 200
    info = r.json()
    assert info["num_classes"] == 7
    assert info["input_size"] == 224


def test_inference_guard_sheds_load_when_saturated(monkeypatch):
    """When concurrent + queued inferences hit the cap, the guard fast-fails with
    503 instead of letting the backlog grow and wedge the single worker."""
    monkeypatch.setattr(main, "_inflight",
                        main._MAX_CONCURRENT_INFER + main._MAX_QUEUED_INFER)

    async def call():
        with pytest.raises(HTTPException) as ei:
            await main._run_inference(lambda: "should not run")
        assert ei.value.status_code == 503

    asyncio.run(call())


def test_inference_guard_runs_when_capacity_available():
    """Under capacity, the guard runs the call and returns its result."""
    async def call():
        return await main._run_inference(lambda x: x * 2, 21)

    assert asyncio.run(call()) == 42

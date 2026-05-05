from fastapi.testclient import TestClient
from app.main import app


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

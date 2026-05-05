"""Tests run against the heuristic fallback (no .h5 file present in the repo)."""
import os
from app.predictor import Predictor
from app.stages import STAGES


def test_predictor_health_with_missing_model(tmp_path):
    p = Predictor(str(tmp_path / "missing.h5"), "test-1.0", input_size=224)
    assert p.is_ready()


def test_predict_returns_expected_keys(png_bytes, tmp_path):
    p = Predictor(str(tmp_path / "missing.h5"), "test-1.0", input_size=224)
    out = p.predict(png_bytes)
    for key in [
        "predicted_stage", "predicted_progress", "confidence",
        "model_version", "processing_time_ms", "raw_predictions",
    ]:
        assert key in out
    assert any(s.name == out["predicted_stage"] for s in STAGES)
    assert 0.0 <= out["predicted_progress"] <= 100.0
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["model_version"].endswith("-fallback")


def test_batch_predictions(png_bytes, tmp_path):
    p = Predictor(str(tmp_path / "missing.h5"), "test-1.0", input_size=224)
    res = p.predict_batch([png_bytes, png_bytes])
    assert len(res) == 2
    assert all("predicted_stage" in r for r in res)

"""Tests run against the heuristic fallback (no .h5 file present in the repo)."""
import os
import pytest
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


def test_predict_returns_sport_and_consumed(png_bytes, tmp_path):
    """The response carries the structure-sport read and the predicted money
    consumed so far (cumulative market cost up to the detected stage)."""
    p = Predictor(str(tmp_path / "missing.h5"), "test-1.0", input_size=224)
    out = p.predict(png_bytes, area_m2=608, perimeter_m=102)

    assert out["structure_sport"] in ("basketball", "volleyball", "unknown")

    mc = out["money_consumed"]
    assert mc["currency"] == "RWF"
    assert mc["low"] <= mc["expected"] <= mc["high"]
    # Consumed cannot exceed the cost of the whole build.
    assert 0.0 <= mc["expected"] <= mc["project_total"]
    assert 0.0 <= mc["within_stage_fraction"] <= 1.0


def test_consumed_estimate_rolls_up_prior_stages():
    """consumed = completed stages in full + current stage pro-rated."""
    from app.cost_model import estimate_costs, consumed_estimate
    c = estimate_costs(area_m2=608, perimeter_m=102)
    per_stage = c["per_stage"]
    # At stage 3, 50% in: stages 1+2 in full + half of stage 3.
    got = consumed_estimate(per_stage, stage_order=3, within_fraction=0.5)
    expected = per_stage[0]["total"] + per_stage[1]["total"] + per_stage[2]["total"] * 0.5
    assert got["expected"] == pytest.approx(expected, rel=1e-6)
    # Stage 1 at 0% in consumes essentially nothing.
    assert consumed_estimate(per_stage, 1, 0.0)["expected"] == 0.0

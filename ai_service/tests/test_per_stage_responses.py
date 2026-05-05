"""Smoke-test that the heuristic predictor returns sensible responses for each
of the seven construction stages. We synthesise representative images and
print the full prediction so a human can sanity-check both the chosen stage
and the per-class probabilities.

These tests are intentionally tolerant: the heuristic is a stop-gap until a
trained CNN is available. We verify (a) progress is in the predicted stage's
band, (b) confidence is finite and reasonable, and for the most distinctive
stages we verify that the predicted stage is in the expected neighbourhood.
"""
from __future__ import annotations
import io
import json
import os

import numpy as np
import pytest
from PIL import Image

from app.predictor import Predictor
from app.stages import STAGES


def _png(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr.astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


def _add_noise(rgb: np.ndarray, sigma: float = 8.0) -> np.ndarray:
    return np.clip(rgb + np.random.normal(0, sigma, rgb.shape), 0, 255)


def _bare_soil() -> bytes:
    rng = np.random.default_rng(1)
    base = np.full((240, 240, 3), (140, 105, 70), dtype=np.float32)  # warm brown
    base += rng.normal(0, 18, base.shape)
    return _png(np.clip(base, 0, 255))


def _gravel_subbase() -> bytes:
    rng = np.random.default_rng(2)
    base = np.full((240, 240, 3), (140, 138, 132), dtype=np.float32)  # mid-grey gravel
    base += rng.normal(0, 25, base.shape)  # textured
    return _png(np.clip(base, 0, 255))


def _concrete_slab() -> bytes:
    rng = np.random.default_rng(3)
    base = np.full((240, 240, 3), (185, 185, 188), dtype=np.float32)  # bright grey
    base += rng.normal(0, 6, base.shape)  # smooth
    return _png(np.clip(base, 0, 255))


def _asphalt_finish() -> bytes:
    rng = np.random.default_rng(4)
    base = np.full((240, 240, 3), (45, 45, 48), dtype=np.float32)
    base += rng.normal(0, 4, base.shape)
    return _png(np.clip(base, 0, 255))


def _line_marking() -> bytes:
    """Asphalt court with bright painted lines/colors."""
    img = np.full((240, 240, 3), (50, 50, 55), dtype=np.float32)
    # Bright key colors covering ~20% of the image
    img[40:60, 20:220] = (220, 60, 60)   # red baseline
    img[170:200, 40:200] = (60, 60, 220)  # blue key
    img[100:115, 60:180] = (240, 200, 50)  # yellow accent
    img += np.random.default_rng(5).normal(0, 3, img.shape)
    return _png(np.clip(img, 0, 255))


def _hoops_metal() -> bytes:
    """Asphalt + bright metal poles with strong vertical edges."""
    img = np.full((240, 240, 3), (60, 60, 65), dtype=np.float32)
    # Vertical bright poles
    img[:, 50:55] = 235
    img[:, 185:190] = 235
    # Backboard rectangles
    img[20:60, 30:80] = 245
    img[20:60, 160:210] = 245
    img += np.random.default_rng(6).normal(0, 4, img.shape)
    return _png(np.clip(img, 0, 255))


def _fenced_court() -> bytes:
    """Many thin vertical/horizontal lines simulating chain-link fence over court."""
    img = np.full((240, 240, 3), (90, 95, 100), dtype=np.float32)
    for x in range(0, 240, 8):
        img[:, x:x + 1] = 220
    for y in range(0, 240, 12):
        img[y:y + 1, :] = 220
    img += np.random.default_rng(7).normal(0, 3, img.shape)
    return _png(np.clip(img, 0, 255))


SCENARIOS = [
    ("bare_soil",      1, _bare_soil),
    ("gravel_subbase", 2, _gravel_subbase),
    ("concrete_slab",  3, _concrete_slab),
    ("asphalt_finish", 4, _asphalt_finish),
    ("line_marking",   5, _line_marking),
    ("hoops_metal",    6, _hoops_metal),
    ("fenced_court",   7, _fenced_court),
]


@pytest.fixture(scope="module")
def predictor(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("model")
    return Predictor(str(tmp / "missing.h5"), "test-1.0", input_size=224)


@pytest.mark.parametrize("name, expected_order, factory", SCENARIOS)
def test_stage_response_is_in_expected_neighbourhood(predictor, name, expected_order, factory, capsys):
    out = predictor.predict(factory())

    # Pretty-print so the developer can eyeball the response
    pretty = {
        "scenario": name,
        "expected_order": expected_order,
        "predicted_stage": out["predicted_stage"],
        "predicted_stage_order": out["predicted_stage_order"],
        "predicted_progress": out["predicted_progress"],
        "confidence": out["confidence"],
        "features": out["raw_predictions"].get("features"),
        "probs": {k: round(v, 3) for k, v in out["raw_predictions"].items() if k.startswith("stage_")},
    }
    with capsys.disabled():
        print("\n" + json.dumps(pretty, indent=2))

    # Hard invariants
    stage = next(s for s in STAGES if s.name == out["predicted_stage"])
    assert stage.progress_lo <= out["predicted_progress"] <= stage.progress_hi
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["model_version"].endswith("-fallback")

    # Soft check: predicted stage should be within ±2 of expected for most scenarios.
    # (Heuristics are inherently noisy; this just guards against complete drift.)
    if name in ("bare_soil", "concrete_slab", "asphalt_finish", "line_marking"):
        assert abs(out["predicted_stage_order"] - expected_order) <= 2, (
            f"{name}: predicted stage {out['predicted_stage_order']} too far from expected {expected_order}"
        )

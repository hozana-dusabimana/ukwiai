"""Tests for the material BOM cost engine, market prices, and terrain analyzer."""
import io

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.cost_model import estimate_costs, detected_materials
from app.market_prices import price_of, MATERIALS


client = TestClient(app)


def _png(color=(110, 90, 70), size=(64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


# ----------------------------- market prices ------------------------------ #
def test_market_index_scales_price():
    base = price_of("concrete", market_index=1.0)
    hot = price_of("concrete", market_index=1.2)
    assert hot.unit_price == pytest.approx(base.unit_price * 1.2)
    # volatility band brackets the expected price
    assert base.unit_price_low < base.unit_price < base.unit_price_high


# ------------------------------ cost engine ------------------------------- #
def test_estimate_costs_covers_all_stages_with_bands():
    c = estimate_costs(area_m2=608, perimeter_m=102, terrain_multiplier=1.0, market_index=1.0)
    assert c["currency"] == "RWF"
    assert len(c["per_stage"]) == 7
    assert c["project_total"] > 0
    # low <= expected <= high at the project level
    assert c["project_total_low"] <= c["project_total"] <= c["project_total_high"]
    # each stage carries an itemised bill that sums (with terrain) into its total
    for s in c["per_stage"]:
        assert s["total"] >= 0
        assert s["total_low"] <= s["total"] <= s["total_high"]


def test_terrain_inflates_terrain_sensitive_stages():
    flat = estimate_costs(area_m2=608, perimeter_m=102, terrain_multiplier=1.0)
    hard = estimate_costs(area_m2=608, perimeter_m=102, terrain_multiplier=1.6)
    # whole-project cost rises on hard ground
    assert hard["project_total"] > flat["project_total"]
    # excavation (sensitivity 1.0) rises more than line-marking (sensitivity 0.1)
    exc_flat = flat["per_stage"][0]["total"]
    exc_hard = hard["per_stage"][0]["total"]
    line_flat = flat["per_stage"][4]["total"]
    line_hard = hard["per_stage"][4]["total"]
    assert (exc_hard / exc_flat) > (line_hard / line_flat)


def test_market_index_raises_whole_bill():
    cheap = estimate_costs(area_m2=608, perimeter_m=102, market_index=1.0)
    pricey = estimate_costs(area_m2=608, perimeter_m=102, market_index=1.3)
    assert pricey["project_total"] > cheap["project_total"]


def test_bigger_court_costs_more():
    small = estimate_costs(area_m2=400, perimeter_m=80)
    big = estimate_costs(area_m2=900, perimeter_m=130)
    assert big["project_total"] > small["project_total"]


def test_detected_materials_translation():
    mats = detected_materials({"has_concrete_slab": True, "has_court_lines": True})
    assert "Poured concrete slab" in mats
    assert "Court line markings" in mats
    assert detected_materials(None) == []


# --------------------------- predict integration -------------------------- #
def test_predict_includes_cost_prediction():
    r = client.post(
        "/predict",
        files={"file": ("t.png", _png(), "image/png")},
        data={"area_m2": "608", "perimeter_m": "102", "terrain_multiplier": "1.4", "market_index": "1.1"},
    )
    assert r.status_code == 200, r.text
    b = r.json()
    assert "materials_visible" in b
    cp = b["cost_prediction"]
    assert cp["currency"] == "RWF"
    assert cp["terrain_multiplier"] == 1.4
    assert cp["market_index"] == 1.1
    assert len(cp["per_stage"]) == 7
    assert b["predicted_stage_cost"] is not None


# ------------------------------- terrain ---------------------------------- #
def test_assess_terrain_endpoint():
    r = client.post("/assess-terrain", files={"file": ("s.png", _png(), "image/png")})
    assert r.status_code == 200, r.text
    b = r.json()
    assert 0.5 <= b["difficulty_multiplier"] <= 2.5
    assert b["difficulty_label"] in {"easy", "normal", "hard", "severe"}
    assert set(b["factors"]) == {"vegetation", "roughness", "slope", "wetness"}

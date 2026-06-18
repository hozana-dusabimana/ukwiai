"""Market price reference for construction materials & labour (Rwanda / RWF).

This is the *market* side of the cost-prediction engine. It answers a single
question for the BOM costing in :mod:`app.cost_model`:

    "What does one unit of material X cost on the market right now?"

Design goals
------------
* **Explainable.** Every number is a named reference unit price, not a black-box
  regression output. A site engineer can read the bill and see exactly why a
  stage costs what it does. (This is why we chose a BOM + market engine over a
  trained price regressor — see ``MODELS.md``.)
* **Market-variable.** Real prices drift with fuel, cement shortages, FX and
  season. We model that two ways, both controllable and auditable:
    1. ``market_index`` — a single multiplier on *all* prices (regional cost of
       living / inflation / FX). Driven by ``AI_MARKET_INDEX`` (default 1.0) and
       overridable per request, so the same site re-priced next quarter moves
       with the market instead of being frozen at plan time.
    2. ``volatility`` — a per-material band (fractional std-dev) that yields a
       low/expected/high price range. The engine reports the band so the UI can
       show "RWF 12.4M (±8%)" rather than a single fragile point estimate.

Prices are reference figures for Kigali, 2026, in RWF. They are intentionally
kept in one place so they can be tuned (or sourced from a live feed) without
touching the costing logic.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Material:
    key: str
    label: str
    unit: str          # the unit the price is quoted in (m2, m3, kg, set, m, ls)
    unit_price: float  # reference market price in RWF per unit (at market_index = 1.0)
    volatility: float  # fractional 1-sigma price band on the market (0.10 = ±10%)
    category: str      # maps to the backend ExpenseCategory taxonomy


# ---------------------------------------------------------------------------
# Reference market catalogue (Kigali, RWF). Tunable / feed-replaceable.
# ---------------------------------------------------------------------------
MATERIALS: dict[str, Material] = {
    # Earthworks ------------------------------------------------------------
    "excavation":     Material("excavation",     "Site clearing & excavation",   "m2",   3_500,  0.18, "labor"),
    "cart_away":      Material("cart_away",      "Spoil cart-away / disposal",    "m3",   9_000,  0.20, "transport"),
    # Sub-base --------------------------------------------------------------
    "hardcore":       Material("hardcore",       "Hardcore / stone sub-base",     "m3",  28_000,  0.16, "materials"),
    "gravel":         Material("gravel",         "Graded gravel & compaction",    "m3",  22_000,  0.16, "materials"),
    "geotextile":     Material("geotextile",     "Geotextile separation fabric",  "m2",   1_800,  0.12, "materials"),
    # Concrete base ---------------------------------------------------------
    "concrete":       Material("concrete",       "Ready-mix concrete (C25)",      "m3", 165_000,  0.22, "materials"),
    "rebar":          Material("rebar",          "Reinforcement steel (rebar)",   "kg",   1_650,  0.25, "materials"),
    "formwork":       Material("formwork",       "Formwork / shuttering",         "m2",   6_500,  0.14, "materials"),
    # Surface finishing -----------------------------------------------------
    "asphalt":        Material("asphalt",        "Asphalt wearing course",        "m2",  18_000,  0.24, "materials"),
    "acrylic":        Material("acrylic",        "Acrylic sport surfacing coats", "m2",  12_500,  0.15, "materials"),
    "primer":         Material("primer",         "Surface primer / binder",       "m2",   2_800,  0.12, "materials"),
    # Line marking ----------------------------------------------------------
    "court_paint":    Material("court_paint",    "Court colour paint",            "m2",   3_200,  0.13, "materials"),
    "line_paint":     Material("line_paint",     "Line-marking paint & masking",  "ls", 320_000,  0.12, "materials"),
    # Hoops -----------------------------------------------------------------
    "hoop_set":       Material("hoop_set",       "Pole + backboard + rim + net",  "set", 1_750_000, 0.20, "equipment"),
    "hoop_footing":   Material("hoop_footing",   "Hoop concrete footing",         "set",  140_000,  0.18, "materials"),
    # Fencing & finals ------------------------------------------------------
    "chainlink":      Material("chainlink",      "Chain-link perimeter fencing",  "m",    42_000,  0.18, "materials"),
    "fence_post":     Material("fence_post",     "Galvanised fence posts",        "m",    15_000,  0.16, "materials"),
    "floodlight":     Material("floodlight",     "LED floodlight + pole",         "set",  680_000,  0.20, "equipment"),
    "bench":          Material("bench",          "Spectator bench",               "set",  220_000,  0.15, "equipment"),
    # Generic labour driver used by every stage -----------------------------
    "labour":         Material("labour",         "Site labour (crew-hours)",      "hr",    4_500,  0.10, "labor"),
}


def market_index_default() -> float:
    """Global market multiplier (inflation / FX / regional). Env-overridable."""
    try:
        return max(0.1, float(os.environ.get("AI_MARKET_INDEX", "1.0")))
    except (TypeError, ValueError):
        return 1.0


@dataclass(frozen=True)
class PricedUnit:
    key: str
    label: str
    unit: str
    category: str
    unit_price: float        # expected market price (RWF) after market_index
    unit_price_low: float    # -1 sigma market band
    unit_price_high: float   # +1 sigma market band
    volatility: float


def price_of(key: str, market_index: float | None = None) -> PricedUnit:
    """Return the current market price for a material, with its volatility band.

    The expected price is ``reference * market_index``; the low/high band comes
    from the material's volatility so callers can surface a realistic market
    range instead of a single brittle figure.
    """
    m = MATERIALS[key]
    idx = market_index_default() if market_index is None else max(0.1, float(market_index))
    expected = m.unit_price * idx
    return PricedUnit(
        key=m.key,
        label=m.label,
        unit=m.unit,
        category=m.category,
        unit_price=round(expected, 2),
        unit_price_low=round(expected * (1.0 - m.volatility), 2),
        unit_price_high=round(expected * (1.0 + m.volatility), 2),
        volatility=m.volatility,
    )

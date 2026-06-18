"""Bill-of-materials cost engine for a basketball-court build.

Given the geometry of a court (surface area + perimeter), the terrain
difficulty of the site, and a market index, this module produces a fully
itemised, market-priced cost for **every** construction stage — independent of
whatever budget was typed in at planning time. That is the whole point: the
predicted cost of a stage can legitimately come out *higher* than its planned
allocation when the materials a photo reveals, the terrain, or the market say
so.

How a stage cost is built up
-----------------------------
    quantity  (driven by court area / perimeter)
      × market unit price   (app.market_prices, scaled by market_index)
      = line total
    Σ line totals + labour  = stage subtotal
      × effective terrain multiplier (per-stage terrain sensitivity)
      = stage total   ──►  with a low/high band from material volatility

The court geometry and terrain come from the project (the backend parses the
court dimensions and stores the terrain difficulty assessed from the site's
background photo); the market index comes from config. Everything here is
deterministic and auditable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .market_prices import price_of, market_index_default
from .stages import STAGES, NUM_CLASSES


# A quantity driver computes how many units of a material a stage needs from the
# court geometry. area_m2 = finished surface incl. run-off; perimeter_m = fence run.
QtyFn = Callable[[float, float], float]


@dataclass(frozen=True)
class BomLine:
    material: str
    qty: QtyFn
    optional: bool = False  # only included when the photo shows evidence of it


# Per-stage terrain sensitivity: how strongly hard ground inflates this stage.
# Earthworks/sub-base/fence footings suffer most on a steep/rocky site; painting
# a court barely cares about terrain. effective = 1 + (difficulty - 1) * sens.
TERRAIN_SENSITIVITY = {
    1: 1.00,  # Site clearing & excavation
    2: 0.80,  # Sub-base preparation
    3: 0.50,  # Concrete slab
    4: 0.30,  # Surface finishing
    5: 0.10,  # Line marking
    6: 0.25,  # Hoops
    7: 0.60,  # Fencing & final works
}

# Bill of materials per stage (1-indexed by stage order). Quantities are scaled
# from court geometry; the constants are standard court construction allowances.
STAGE_BOM: dict[int, list[BomLine]] = {
    1: [
        BomLine("excavation", lambda a, p: a),
        BomLine("cart_away",  lambda a, p: a * 0.25),          # ~0.25 m spoil depth
        BomLine("labour",     lambda a, p: a * 0.15),
    ],
    2: [
        BomLine("hardcore",   lambda a, p: a * 0.15),          # 150 mm hardcore
        BomLine("gravel",     lambda a, p: a * 0.10),          # 100 mm graded gravel
        BomLine("geotextile", lambda a, p: a),
        BomLine("labour",     lambda a, p: a * 0.12),
    ],
    3: [
        BomLine("concrete",   lambda a, p: a * 0.12),          # 120 mm slab
        BomLine("rebar",      lambda a, p: a * 8.0),           # ~8 kg/m2 mesh
        BomLine("formwork",   lambda a, p: p * 0.20),
        BomLine("labour",     lambda a, p: a * 0.20),
    ],
    4: [
        BomLine("primer",     lambda a, p: a),
        BomLine("acrylic",    lambda a, p: a),
        BomLine("asphalt",    lambda a, p: a, optional=True),  # added when photo shows asphalt
        BomLine("labour",     lambda a, p: a * 0.10),
    ],
    5: [
        BomLine("court_paint", lambda a, p: a),
        BomLine("line_paint",  lambda a, p: 1.0),
        BomLine("labour",      lambda a, p: a * 0.05),
    ],
    6: [
        BomLine("hoop_set",     lambda a, p: 2.0),
        BomLine("hoop_footing", lambda a, p: 2.0),
        BomLine("labour",       lambda a, p: 80.0),
    ],
    7: [
        BomLine("chainlink",   lambda a, p: p),
        BomLine("fence_post",  lambda a, p: p),
        BomLine("floodlight",  lambda a, p: 4.0, optional=True),
        BomLine("bench",       lambda a, p: 2.0, optional=True),
        BomLine("labour",      lambda a, p: p * 0.5),
    ],
}

# Standard FIBA outdoor court: 28 m × 15 m playing area + 2 m run-off all round.
DEFAULT_AREA_M2 = 32.0 * 19.0      # 608 m²
DEFAULT_PERIMETER_M = 2 * (32.0 + 19.0)  # 102 m


def effective_terrain(stage_order: int, terrain_multiplier: float) -> float:
    sens = TERRAIN_SENSITIVITY.get(stage_order, 0.5)
    return round(1.0 + (terrain_multiplier - 1.0) * sens, 4)


def estimate_costs(
    *,
    area_m2: float | None = None,
    perimeter_m: float | None = None,
    terrain_multiplier: float = 1.0,
    market_index: float | None = None,
    detected: dict | None = None,
) -> dict:
    """Full market-priced bill for all 7 stages at this site.

    ``detected`` is an optional map of photo-evidence flags (e.g.
    ``{"has_asphalt_surface": True}``) used to switch *optional* BOM lines on.
    The result is independent of any planning budget — a stage total can exceed
    its planned allocation.
    """
    area = float(area_m2) if area_m2 and area_m2 > 0 else DEFAULT_AREA_M2
    perim = float(perimeter_m) if perimeter_m and perimeter_m > 0 else DEFAULT_PERIMETER_M
    idx = market_index_default() if market_index is None else max(0.1, float(market_index))
    tmul = max(0.5, float(terrain_multiplier or 1.0))
    detected = detected or {}

    per_stage: list[dict] = []
    project_total = project_low = project_high = 0.0

    for sdef in STAGES:
        order = sdef.order
        eff_terrain = effective_terrain(order, tmul)
        lines_out: list[dict] = []
        subtotal = sub_low = sub_high = 0.0

        for line in STAGE_BOM.get(order, []):
            if line.optional and not _optional_included(line.material, detected):
                continue
            qty = round(line.qty(area, perim), 3)
            if qty <= 0:
                continue
            pu = price_of(line.material, idx)
            line_total = qty * pu.unit_price
            line_lo = qty * pu.unit_price_low
            line_hi = qty * pu.unit_price_high
            subtotal += line_total
            sub_low += line_lo
            sub_high += line_hi
            lines_out.append({
                "material": pu.key,
                "label": pu.label,
                "category": pu.category,
                "unit": pu.unit,
                "quantity": qty,
                "unit_price": pu.unit_price,
                "line_total": round(line_total, 2),
                "line_total_low": round(line_lo, 2),
                "line_total_high": round(line_hi, 2),
            })

        total = subtotal * eff_terrain
        total_lo = sub_low * eff_terrain
        total_hi = sub_high * eff_terrain
        project_total += total
        project_low += total_lo
        project_high += total_hi

        per_stage.append({
            "stage_order": order,
            "stage_name": sdef.name,
            "materials": lines_out,
            "subtotal": round(subtotal, 2),
            "terrain_multiplier": eff_terrain,
            "total": round(total, 2),
            "total_low": round(total_lo, 2),
            "total_high": round(total_hi, 2),
        })

    return {
        "currency": "RWF",
        "area_m2": round(area, 2),
        "perimeter_m": round(perim, 2),
        "terrain_multiplier": round(tmul, 4),
        "market_index": round(idx, 4),
        "per_stage": per_stage,
        "project_total": round(project_total, 2),
        "project_total_low": round(project_low, 2),
        "project_total_high": round(project_high, 2),
    }


def _optional_included(material: str, detected: dict) -> bool:
    """Switch on an optional BOM line only when the photo supports it."""
    if material == "asphalt":
        return bool(detected.get("has_asphalt_surface"))
    # floodlight / bench are part of "final works" — included by default once we
    # actually reach fencing, so treat their absence of negative evidence as on.
    return True


# Human-readable list of materials a photo appears to show, for the analysis UI.
_MATERIAL_EVIDENCE = [
    ("has_soil_dominant",    "Exposed soil / bare ground"),
    ("has_gravel_surface",   "Gravel / hardcore sub-base"),
    ("has_concrete_slab",    "Poured concrete slab"),
    ("has_asphalt_surface",  "Asphalt wearing course"),
    ("has_painted_court",    "Acrylic / painted court surface"),
    ("has_court_lines",      "Court line markings"),
    ("has_hoop_signal",      "Hoop / backboard structures"),
    ("has_backboard",        "Basketball backboard"),
    ("has_fence_pattern",    "Perimeter fencing"),
]


def detected_materials(features: dict | None) -> list[str]:
    """Translate heuristic feature flags into a visible-materials list."""
    if not features:
        return []
    return [label for key, label in _MATERIAL_EVIDENCE if features.get(key)]

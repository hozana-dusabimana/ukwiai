"""Site-terrain difficulty analyzer.

At project setup the user uploads a photo of the *background* — the raw ground
where the court will be built. Some sites are flat, cleared and easy; others are
steep, rocky, waterlogged or thick with vegetation, and every earth-moving stage
on them costs more. This module reads that one photo and produces a single
**terrain difficulty multiplier** the cost engine applies to each stage
(weighted by how terrain-sensitive the stage is — see ``cost_model``).

It is a deterministic OpenCV heuristic (no training data exists for "how hard is
this plot"), combining four readable signals:

* **vegetation** — green coverage; more bush ⇒ more clearing/grubbing.
* **roughness**  — surface texture energy; rocks/rubble ⇒ harder excavation.
* **slope**      — vertical intensity gradient & horizon tilt ⇒ cut/fill & retaining.
* **wetness**    — dark/blue low-lying patches ⇒ drainage & dewatering.

The score in [0, 1] maps to a multiplier in ~[0.85, 1.80] so a pristine graded
plot is slightly *cheaper* than nominal and a severe site up to ~80% dearer.
"""
from __future__ import annotations

import cv2
import numpy as np

from .preprocessing import decode_image

# Multiplier range. score 0 -> easiest (slightly under nominal), 1 -> severe.
_MULT_MIN = 0.85
_MULT_MAX = 1.80

# Relative weights of the four factors in the difficulty score.
_WEIGHTS = {"vegetation": 0.30, "roughness": 0.30, "slope": 0.28, "wetness": 0.12}


def _label(mult: float) -> str:
    if mult < 1.0:
        return "easy"
    if mult < 1.2:
        return "normal"
    if mult < 1.45:
        return "hard"
    return "severe"


def assess_terrain(image_bytes: bytes, size: int = 384) -> dict:
    """Analyse a site-background photo into a terrain difficulty assessment."""
    bgr = decode_image(image_bytes)
    bgr = cv2.resize(bgr, (size, size), interpolation=cv2.INTER_AREA)
    H, W = bgr.shape[:2]
    total = float(H * W)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # --- vegetation: green hue with reasonable saturation ---
    veg_mask = ((h >= 35) & (h <= 85) & (s > 40) & (v > 30))
    vegetation = float(veg_mask.sum()) / total

    # --- roughness: texture energy (Laplacian variance), normalised ---
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    roughness = float(np.clip((lap_var - 150.0) / 2500.0, 0.0, 1.0))

    # --- slope: how strongly intensity ramps top->bottom + horizon tilt ---
    row_means = gray.mean(axis=1)
    # normalised linear ramp magnitude across the frame height
    ramp = np.polyfit(np.arange(H), row_means, 1)[0] if H > 1 else 0.0
    slope_ramp = float(np.clip(abs(ramp) * H / 80.0, 0.0, 1.0))
    # horizon tilt: angle spread of long, near-horizontal lines
    edges = cv2.Canny(gray, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=60,
                            minLineLength=int(W * 0.4), maxLineGap=10)
    tilt = 0.0
    if lines is not None:
        angles = []
        for x1, y1, x2, y2 in lines[:, 0]:
            ang = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            ang = min(ang, 180 - ang)
            if ang < 35:  # only near-horizontal references
                angles.append(ang)
        if angles:
            tilt = float(np.clip(np.mean(angles) / 25.0, 0.0, 1.0))
    slope = max(slope_ramp, tilt)

    # --- wetness: dark and/or blue low-saturation-of-warmth patches ---
    wet_mask = (((h >= 90) & (h <= 130) & (s > 40) & (v < 160))  # bluish water
                | ((v < 55) & (s < 80)))                          # dark wet mud
    wetness = float(np.clip(float(wet_mask.sum()) / total * 2.5, 0.0, 1.0))

    factors = {
        "vegetation": round(vegetation, 3),
        "roughness": round(roughness, 3),
        "slope": round(slope, 3),
        "wetness": round(wetness, 3),
    }
    score = float(sum(_WEIGHTS[k] * factors[k] for k in _WEIGHTS))
    score = float(np.clip(score, 0.0, 1.0))
    multiplier = round(_MULT_MIN + score * (_MULT_MAX - _MULT_MIN), 3)
    label = _label(multiplier)

    return {
        "difficulty_multiplier": multiplier,
        "difficulty_score": round(score, 3),
        "difficulty_label": label,
        "factors": factors,
        "summary": _summary(label, multiplier, factors),
    }


def _summary(label: str, mult: float, f: dict) -> str:
    drivers = sorted(f.items(), key=lambda kv: kv[1], reverse=True)
    top = ", ".join(k for k, val in drivers[:2] if val > 0.2) or "no strong difficulty drivers"
    pct = round((mult - 1.0) * 100)
    direction = (f"raises earth-works cost by ~{pct}%" if pct > 0
                 else f"lowers earth-works cost by ~{abs(pct)}%" if pct < 0
                 else "leaves cost at nominal")
    return (f"Terrain assessed as {label} (×{mult}). Main drivers: {top}. "
            f"This {direction} on terrain-sensitive stages.")

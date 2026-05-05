"""Canonical mapping between class labels, stage names, and progress ranges.

The CNN classification head outputs an index 0..6 — these constants translate
that index into the human-readable stage name, expected progress range, and
expected cost percentage. Kept in sync with database/init.sql.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class StageDef:
    order: int
    name: str
    progress_lo: float
    progress_hi: float
    cost_pct: float
    description: str


STAGES: list[StageDef] = [
    StageDef(1, "Site Clearing & Excavation",         0.0,  10.0,  8.0, "Bare ground, machinery, soil removal."),
    StageDef(2, "Sub-base Preparation",              10.0,  25.0, 12.0, "Gravel layer laid, compacted soil."),
    StageDef(3, "Base Layer / Concrete Slab",        25.0,  45.0, 25.0, "Poured concrete, formwork, rebar."),
    StageDef(4, "Surface Finishing (Asphalt/Acrylic)", 45.0,  65.0, 22.0, "Smooth surface, asphalt or acrylic coats."),
    StageDef(5, "Court Line Marking & Painting",     65.0,  80.0, 13.0, "Painted lines, court colors."),
    StageDef(6, "Hoops & Backboards Installation",   80.0,  92.0, 12.0, "Poles, backboards, rims, nets."),
    StageDef(7, "Fencing & Final Touches",           92.0, 100.0,  8.0, "Perimeter fencing, lighting, benches."),
]

NUM_CLASSES = len(STAGES)


def stage_for_index(idx: int) -> StageDef:
    if not 0 <= idx < len(STAGES):
        raise ValueError(f"Class index {idx} out of range")
    return STAGES[idx]


def stage_midpoint(idx: int) -> float:
    s = stage_for_index(idx)
    return (s.progress_lo + s.progress_hi) / 2.0

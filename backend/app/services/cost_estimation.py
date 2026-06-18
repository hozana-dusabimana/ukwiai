from __future__ import annotations
import re
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.project import Project
from app.models.budget import BudgetRecord
from app.models.cost import CostEstimation, DeviationStatus
from app.models.image import SiteImage
from app.models.stage import ProjectStage, ConstructionStage, ProjectStageStatus


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# Standard FIBA outdoor court (28×15 playing area + 2 m run-off) — must match
# the AI cost engine's defaults so a project with no stated dimensions is priced
# consistently on both sides.
_DEFAULT_AREA_M2 = 32.0 * 19.0
_DEFAULT_PERIMETER_M = 2 * (32.0 + 19.0)


def parse_court_geometry(court_dimensions: str | None) -> tuple[float, float]:
    """Parse a free-text court size (e.g. "28x15", "28 x 15 m", "28m×15m") into
    a (surface_area_m2, perimeter_m) pair, adding a 2 m run-off margin all round.

    Falls back to the standard outdoor court when nothing parseable is found, so
    the cost engine always has a sane geometry to scale the bill of materials.
    """
    if court_dimensions:
        nums = re.findall(r"\d+(?:\.\d+)?", court_dimensions)
        if len(nums) >= 2:
            w, h = float(nums[0]), float(nums[1])
            if w > 0 and h > 0:
                # add 2 m run-off on every side
                wf, hf = w + 4.0, h + 4.0
                return round(wf * hf, 2), round(2 * (wf + hf), 2)
    return _DEFAULT_AREA_M2, _DEFAULT_PERIMETER_M


def project_cost_context(project: Project) -> dict:
    """Cost-engine inputs for a project: geometry, terrain difficulty, market."""
    area, perimeter = parse_court_geometry(project.court_dimensions)
    return {
        "area_m2": area,
        "perimeter_m": perimeter,
        "terrain_multiplier": float(project.terrain_difficulty or 1),
        "market_index": float(settings.AI_MARKET_INDEX),
    }


def total_recorded_expenses(db: Session, project_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(BudgetRecord.amount), 0)).where(BudgetRecord.project_id == project_id)
    )
    return Decimal(str(total or 0))


def total_ai_predicted_cost(db: Session, project_id: int) -> Decimal:
    """Sum of the market-priced per-stage predictions (can exceed total_budget)."""
    total = db.scalar(
        select(func.coalesce(func.sum(ProjectStage.ai_predicted_cost), 0))
        .where(ProjectStage.project_id == project_id)
    )
    return Decimal(str(total or 0))


def compute_cost_estimation(
    db: Session,
    project: Project,
    predicted_progress: Decimal | float | None,
    image: SiteImage | None = None,
    persist: bool = True,
) -> CostEstimation:
    """Apply the spec's cost estimation formulas and (optionally) persist a snapshot.

    "Spend so far" uses the *effective* figure — recorded expenses, or the
    AI's market-priced per-stage prediction when nothing has been logged yet —
    so the variance/projection/deviation stay meaningful on a project whose
    costs are only being tracked from photos. Because the prediction is grounded
    in real material prices, terrain and market (not a slice of the plan), the
    effective spend — and therefore the variance — can legitimately exceed the
    planned budget.

    Formulas (effective = max(recorded, AI-predicted)):
      estimated_cost_used = (progress / 100) * total_budget
      remaining_budget    = total_budget - effective
      variance            = effective - estimated_cost_used
      projected_total_cost = (effective / progress) * 100 (when progress > 0)
      deviation_status:
          'over'     if variance > +X% of total_budget
          'under'    if variance < -X% of total_budget
          'on_track' otherwise   (X = settings.BUDGET_OVERRUN_PERCENT)
    """
    if predicted_progress is None:
        progress = Decimal("0")
    else:
        progress = Decimal(str(predicted_progress))

    total_budget = Decimal(str(project.total_budget or 0))
    actual = total_recorded_expenses(db, project.id)
    # When no expenses have been logged yet, fall back to the AI's market-priced
    # prediction (rolled up from per-stage material costs the vision model has
    # marked done) so "spend so far" and the projection aren't stuck at zero on a
    # fresh project — and so a site that is materially over the plan shows it.
    ai_predicted = total_ai_predicted_cost(db, project.id)
    effective = actual if actual > ai_predicted else ai_predicted
    estimated_used = _q(total_budget * progress / Decimal("100")) if total_budget else Decimal("0.00")
    remaining = _q(total_budget - effective)
    variance = _q(effective - estimated_used)

    if progress > 0:
        projected_total = _q(effective / progress * Decimal("100"))
    else:
        projected_total = total_budget

    threshold_amount = total_budget * Decimal(str(settings.BUDGET_OVERRUN_PERCENT)) / Decimal("100")
    if variance > threshold_amount:
        status = DeviationStatus.over
    elif variance < -threshold_amount:
        status = DeviationStatus.under
    else:
        status = DeviationStatus.on_track

    estimation = CostEstimation(
        project_id=project.id,
        image_id=image.id if image else None,
        estimated_progress=progress,
        estimated_cost_used=estimated_used,
        actual_cost_recorded=actual,
        variance=variance,
        predicted_remaining_budget=remaining,
        projected_total_cost=projected_total,
        deviation_status=status,
    )
    if persist:
        db.add(estimation)
        db.flush()
    return estimation


def total_ai_inferred_cost(db: Session, project_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(ProjectStage.ai_inferred_cost), 0))
        .where(ProjectStage.project_id == project_id)
    )
    return Decimal(str(total or 0))


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def find_project_stage(
    db: Session,
    project_id: int,
    predicted_stage_name: str | None,
) -> tuple[ProjectStage, ConstructionStage] | None:
    """Resolve the AI-predicted stage name to this project's ProjectStage row.

    Uses the same fuzzy name matching as `apply_ai_inferred_progress` (exact
    normalized match first, then substring containment) so the two stay in sync.
    Returns ``None`` when the project has no stages or no name matches.
    """
    if not predicted_stage_name:
        return None
    rows = db.execute(
        select(ProjectStage, ConstructionStage)
        .join(ConstructionStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(ProjectStage.project_id == project_id)
        .order_by(ConstructionStage.stage_order)
    ).all()
    if not rows:
        return None
    pred = _normalize(predicted_stage_name)
    exact = next(((ps, cs) for ps, cs in rows if _normalize(cs.stage_name) == pred), None)
    if exact:
        return exact
    return next(
        ((ps, cs) for ps, cs in rows
         if pred in _normalize(cs.stage_name) or _normalize(cs.stage_name) in pred),
        None,
    )


def apply_ai_inferred_progress(
    db: Session,
    project_id: int,
    predicted_stage_name: str | None,
    predicted_progress_percentage: Decimal | float | int | None,
    per_stage_market: dict[int, float] | None = None,
) -> int:
    """Overlay the latest AI prediction onto each project_stage row.

    Two per-stage spend figures are maintained side by side:
      - ``ai_inferred_cost``  — a *slice of the plan* (allocated_budget × fill).
        Useful as "how much of the budget this progress represents".
      - ``ai_predicted_cost`` — the *market-priced* cost of the materials for the
        stage (from ``per_stage_market``, keyed by stage_order), rolled up the
        same way. This is grounded in real prices + terrain + market, so it can
        exceed the allocation and is what drives over-budget detection.

    Rules (applied to both figures):
      - stages BEFORE the predicted stage → full stage cost; status promoted to
        `completed` (only if not_started/in_progress); start/end dates filled.
      - the predicted stage → full stage cost × within-stage fill; status
        promoted to `in_progress` (or `completed` if predicted >= 98 %).
      - stages AFTER the predicted stage → 0; status unchanged.

    Returns the number of project_stage rows touched.
    """
    if not predicted_stage_name:
        return 0
    if predicted_progress_percentage is None:
        return 0
    per_stage_market = per_stage_market or {}

    rows = db.execute(
        select(ProjectStage, ConstructionStage)
        .join(ConstructionStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(ProjectStage.project_id == project_id)
        .order_by(ConstructionStage.stage_order)
    ).all()
    if not rows:
        return 0

    pred = _normalize(predicted_stage_name)
    predicted_row = next(
        (cs for _, cs in rows if _normalize(cs.stage_name) == pred),
        None,
    ) or next(
        (cs for _, cs in rows if pred in _normalize(cs.stage_name) or _normalize(cs.stage_name) in pred),
        None,
    )
    if predicted_row is None:
        return 0

    predicted_order = predicted_row.stage_order
    overall_progress = max(Decimal("0"), min(Decimal("100"), Decimal(str(predicted_progress_percentage))))

    # Compute within-stage fill for the predicted stage using each stage's
    # `expected_progress_percentage` as the end-of-stage threshold.
    stages_by_order = {cs.stage_order: cs for _, cs in rows}
    prev_cs = stages_by_order.get(predicted_order - 1)
    curr_cs = stages_by_order[predicted_order]
    prev_end = Decimal(str(prev_cs.expected_progress_percentage)) if prev_cs else Decimal("0")
    curr_end = Decimal(str(curr_cs.expected_progress_percentage))
    span = curr_end - prev_end if curr_end > prev_end else Decimal("100")
    within_fraction = (overall_progress - prev_end) / span
    if within_fraction < 0:
        within_fraction = Decimal("0")
    if within_fraction > 1:
        within_fraction = Decimal("1")

    today = date.today()
    touched = 0

    for ps, cs in rows:
        alloc = Decimal(str(ps.allocated_budget or 0))
        market_full = Decimal(str(per_stage_market.get(cs.stage_order, 0)))
        if cs.stage_order < predicted_order:
            ps.ai_inferred_cost = _q(alloc)
            ps.ai_predicted_cost = _q(market_full)
            if ps.status in (ProjectStageStatus.not_started, ProjectStageStatus.in_progress):
                ps.status = ProjectStageStatus.completed
            if ps.actual_start_date is None:
                ps.actual_start_date = today
            if ps.actual_end_date is None:
                ps.actual_end_date = today
            touched += 1
        elif cs.stage_order == predicted_order:
            if overall_progress >= Decimal("98"):
                ps.ai_inferred_cost = _q(alloc)
                ps.ai_predicted_cost = _q(market_full)
                if ps.status != ProjectStageStatus.completed:
                    ps.status = ProjectStageStatus.completed
                if ps.actual_start_date is None:
                    ps.actual_start_date = today
                if ps.actual_end_date is None:
                    ps.actual_end_date = today
            else:
                ps.ai_inferred_cost = _q(alloc * within_fraction)
                ps.ai_predicted_cost = _q(market_full * within_fraction)
                if ps.status == ProjectStageStatus.not_started:
                    ps.status = ProjectStageStatus.in_progress
                if ps.actual_start_date is None:
                    ps.actual_start_date = today
            touched += 1
        else:
            # Strictly clear any stale AI estimate on stages now considered future.
            if ps.ai_inferred_cost != Decimal("0") or ps.ai_predicted_cost != Decimal("0"):
                ps.ai_inferred_cost = Decimal("0")
                ps.ai_predicted_cost = Decimal("0")
                touched += 1

    db.flush()
    return touched

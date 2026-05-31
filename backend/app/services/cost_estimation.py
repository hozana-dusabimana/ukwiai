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


def total_recorded_expenses(db: Session, project_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(BudgetRecord.amount), 0)).where(BudgetRecord.project_id == project_id)
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

    Formulas:
      estimated_cost_used = (progress / 100) * total_budget
      remaining_budget    = total_budget - actual_cost_recorded
      variance            = actual_cost_recorded - estimated_cost_used
      projected_total_cost = (actual_cost_recorded / progress) * 100 (when progress > 0)
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
    estimated_used = _q(total_budget * progress / Decimal("100")) if total_budget else Decimal("0.00")
    remaining = _q(total_budget - actual)
    variance = _q(actual - estimated_used)

    if progress > 0:
        projected_total = _q(actual / progress * Decimal("100"))
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
) -> int:
    """Overlay the latest AI prediction onto each project_stage row.

    Rules:
      - stages BEFORE the predicted stage → ai_inferred_cost = allocated_budget,
        status promoted to `completed` (only if currently not_started/in_progress),
        actual_start_date/actual_end_date filled if still null.
      - the predicted stage → ai_inferred_cost = allocated_budget × within-stage fill,
        status promoted to `in_progress` (or `completed` if predicted >= 98 %).
      - stages AFTER the predicted stage → ai_inferred_cost = 0, status unchanged.

    Returns the number of project_stage rows touched.
    """
    if not predicted_stage_name:
        return 0
    if predicted_progress_percentage is None:
        return 0

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
        if cs.stage_order < predicted_order:
            ps.ai_inferred_cost = _q(alloc)
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
                if ps.status != ProjectStageStatus.completed:
                    ps.status = ProjectStageStatus.completed
                if ps.actual_start_date is None:
                    ps.actual_start_date = today
                if ps.actual_end_date is None:
                    ps.actual_end_date = today
            else:
                ps.ai_inferred_cost = _q(alloc * within_fraction)
                if ps.status == ProjectStageStatus.not_started:
                    ps.status = ProjectStageStatus.in_progress
                if ps.actual_start_date is None:
                    ps.actual_start_date = today
            touched += 1
        else:
            # Strictly clear any stale AI estimate on stages now considered future.
            if ps.ai_inferred_cost != Decimal("0"):
                ps.ai_inferred_cost = Decimal("0")
                touched += 1

    db.flush()
    return touched

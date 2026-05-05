from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.project import Project
from app.models.budget import BudgetRecord
from app.models.cost import CostEstimation, DeviationStatus
from app.models.image import SiteImage


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

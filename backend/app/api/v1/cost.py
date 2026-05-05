from typing import Annotated
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_engineer_plus
from app.models.project import Project
from app.models.cost import CostEstimation
from app.models.analysis import ProgressAnalysis
from app.models.user import User
from app.schemas.cost import CostEstimationOut, CostComparison
from app.services.cost_estimation import compute_cost_estimation, total_recorded_expenses
from app.services.alerts import evaluate_cost_alerts
from app.services.audit import log_action

router = APIRouter(tags=["cost"])


@router.post("/projects/{project_id}/estimate-cost", response_model=CostEstimationOut)
def estimate_cost(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
):
    """Recompute and persist a cost estimation using the latest AI analysis."""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    latest = db.scalars(
        select(ProgressAnalysis)
        .where(ProgressAnalysis.project_id == project_id)
        .order_by(desc(ProgressAnalysis.analysis_date)).limit(1)
    ).first()
    progress = latest.predicted_progress_percentage if latest else Decimal("0")
    estimation = compute_cost_estimation(db, p, progress, image=latest.image if latest else None)
    evaluate_cost_alerts(db, p, estimation)
    log_action(db, user.id, "cost.estimate", "project", project_id)
    db.commit()
    db.refresh(estimation)
    return estimation


@router.get("/projects/{project_id}/cost-comparison", response_model=CostComparison)
def cost_comparison(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    e = db.scalars(
        select(CostEstimation).where(CostEstimation.project_id == project_id)
        .order_by(desc(CostEstimation.generated_at)).limit(1)
    ).first()
    if not e:
        # On-the-fly compute, but don't persist
        latest = db.scalars(
            select(ProgressAnalysis).where(ProgressAnalysis.project_id == project_id)
            .order_by(desc(ProgressAnalysis.analysis_date)).limit(1)
        ).first()
        progress = latest.predicted_progress_percentage if latest else Decimal("0")
        e = compute_cost_estimation(db, p, progress, persist=False)

    budget = float(p.total_budget or 1)
    variance = float(e.variance or 0)
    return CostComparison(
        estimated_cost_used=Decimal(str(e.estimated_cost_used or 0)),
        actual_cost_recorded=Decimal(str(e.actual_cost_recorded or 0)),
        variance=Decimal(str(variance)),
        variance_percent=variance / budget * 100 if budget else 0.0,
        deviation_status=e.deviation_status,
    )


@router.get("/projects/{project_id}/remaining-budget")
def remaining_budget(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    spent = total_recorded_expenses(db, project_id)
    return {
        "total_budget": float(p.total_budget or 0),
        "spent": float(spent),
        "remaining": float((p.total_budget or 0) - spent),
        "remaining_percent": (1 - float(spent) / float(p.total_budget)) * 100 if p.total_budget else 0.0,
    }


@router.get("/projects/{project_id}/cost-forecast")
def cost_forecast(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    latest = db.scalars(
        select(ProgressAnalysis).where(ProgressAnalysis.project_id == project_id)
        .order_by(desc(ProgressAnalysis.analysis_date)).limit(1)
    ).first()
    progress = latest.predicted_progress_percentage if latest else Decimal("0")
    e = compute_cost_estimation(db, p, progress, persist=False)
    return {
        "predicted_progress": float(progress or 0),
        "estimated_cost_used": float(e.estimated_cost_used or 0),
        "actual_cost_recorded": float(e.actual_cost_recorded or 0),
        "projected_total_cost": float(e.projected_total_cost or 0),
        "predicted_remaining_budget": float(e.predicted_remaining_budget or 0),
        "deviation_status": e.deviation_status.value,
    }


@router.get("/projects/{project_id}/variance-analysis")
def variance_analysis(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
):
    """Time series of past variance snapshots for charting."""
    rows = db.scalars(
        select(CostEstimation).where(CostEstimation.project_id == project_id)
        .order_by(CostEstimation.generated_at).limit(200)
    ).all()
    return [
        {
            "generated_at": r.generated_at,
            "estimated_progress": float(r.estimated_progress or 0),
            "estimated_cost_used": float(r.estimated_cost_used or 0),
            "actual_cost_recorded": float(r.actual_cost_recorded or 0),
            "variance": float(r.variance or 0),
            "deviation_status": r.deviation_status.value,
        } for r in rows
    ]

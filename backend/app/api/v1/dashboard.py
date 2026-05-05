from typing import Annotated
from decimal import Decimal
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc, cast, Date
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.project import Project, ProjectStatus
from app.models.budget import BudgetRecord
from app.models.analysis import ProgressAnalysis
from app.models.cost import CostEstimation, DeviationStatus
from app.models.alert import Alert
from app.models.user import UserRole
from app.schemas.dashboard import DashboardOverview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _scope(stmt, user):
    if user.role == UserRole.viewer:
        stmt = stmt.where(Project.created_by == user.id)
    return stmt


@router.get("/overview", response_model=DashboardOverview)
def overview(db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    project_ids = db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        zero = Decimal("0")
        return DashboardOverview(
            total_projects=0, active_projects=0, completed_projects=0,
            total_budget=zero, total_spent=zero, remaining_budget=zero,
            average_progress=0.0, over_budget_count=0, on_track_count=0, under_budget_count=0,
        )

    total_projects = len(project_ids)
    active = db.scalar(select(func.count()).select_from(Project).where(Project.id.in_(project_ids), Project.status == ProjectStatus.ongoing)) or 0
    completed = db.scalar(select(func.count()).select_from(Project).where(Project.id.in_(project_ids), Project.status == ProjectStatus.completed)) or 0
    total_budget = db.scalar(select(func.coalesce(func.sum(Project.total_budget), 0)).where(Project.id.in_(project_ids))) or 0
    total_spent = db.scalar(select(func.coalesce(func.sum(BudgetRecord.amount), 0)).where(BudgetRecord.project_id.in_(project_ids))) or 0

    # average_progress: latest analysis per project
    avg_progress = 0.0
    progresses = []
    for pid in project_ids:
        latest = db.scalars(
            select(ProgressAnalysis).where(ProgressAnalysis.project_id == pid)
            .order_by(desc(ProgressAnalysis.analysis_date)).limit(1)
        ).first()
        if latest and latest.predicted_progress_percentage is not None:
            progresses.append(float(latest.predicted_progress_percentage))
    if progresses:
        avg_progress = sum(progresses) / len(progresses)

    # Latest deviation per project
    over = on_track = under = 0
    for pid in project_ids:
        e = db.scalars(
            select(CostEstimation).where(CostEstimation.project_id == pid)
            .order_by(desc(CostEstimation.generated_at)).limit(1)
        ).first()
        if not e:
            continue
        if e.deviation_status == DeviationStatus.over:
            over += 1
        elif e.deviation_status == DeviationStatus.under:
            under += 1
        else:
            on_track += 1

    return DashboardOverview(
        total_projects=total_projects,
        active_projects=active,
        completed_projects=completed,
        total_budget=Decimal(str(total_budget)),
        total_spent=Decimal(str(total_spent)),
        remaining_budget=Decimal(str(total_budget)) - Decimal(str(total_spent)),
        average_progress=avg_progress,
        over_budget_count=over,
        on_track_count=on_track,
        under_budget_count=under,
    )


@router.get("/active-projects")
def active_projects(db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    rows = db.scalars(
        _scope(select(Project), user).where(Project.status == ProjectStatus.ongoing).order_by(desc(Project.updated_at)).limit(10)
    ).all()
    return [
        {"id": r.id, "name": r.project_name, "code": r.project_code, "status": r.status.value, "budget": float(r.total_budget or 0)}
        for r in rows
    ]


@router.get("/budget-stats")
def budget_stats(db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    project_ids = db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        return {"total_budget": 0, "total_spent": 0, "by_category": {}}
    total_budget = db.scalar(select(func.coalesce(func.sum(Project.total_budget), 0)).where(Project.id.in_(project_ids))) or 0
    total_spent = db.scalar(select(func.coalesce(func.sum(BudgetRecord.amount), 0)).where(BudgetRecord.project_id.in_(project_ids))) or 0
    cat_rows = db.execute(
        select(BudgetRecord.expense_category, func.coalesce(func.sum(BudgetRecord.amount), 0))
        .where(BudgetRecord.project_id.in_(project_ids))
        .group_by(BudgetRecord.expense_category)
    ).all()
    return {
        "total_budget": float(total_budget),
        "total_spent": float(total_spent),
        "by_category": {c.value: float(amt or 0) for c, amt in cat_rows},
    }


@router.get("/recent-activities")
def recent_activities(db: Annotated[Session, Depends(get_db)], user: CurrentUser, limit: int = Query(15, ge=1, le=50)):
    project_ids = db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        return []
    items: list[dict] = []
    analyses = db.scalars(
        select(ProgressAnalysis).where(ProgressAnalysis.project_id.in_(project_ids))
        .order_by(desc(ProgressAnalysis.analysis_date)).limit(limit)
    ).all()
    for a in analyses:
        items.append({
            "type": "ai_analysis",
            "timestamp": a.analysis_date,
            "project_id": a.project_id,
            "summary": f"AI analyzed image — predicted {a.predicted_stage} ({a.predicted_progress_percentage}%)",
        })
    expenses = db.scalars(
        select(BudgetRecord).where(BudgetRecord.project_id.in_(project_ids))
        .order_by(desc(BudgetRecord.created_at)).limit(limit)
    ).all()
    for e in expenses:
        items.append({
            "type": "expense",
            "timestamp": e.created_at,
            "project_id": e.project_id,
            "summary": f"Expense {e.expense_category.value}: {float(e.amount):,.2f}",
        })
    alerts = db.scalars(
        select(Alert).where(Alert.project_id.in_(project_ids))
        .order_by(desc(Alert.triggered_at)).limit(limit)
    ).all()
    for a in alerts:
        items.append({
            "type": "alert",
            "timestamp": a.triggered_at,
            "project_id": a.project_id,
            "summary": f"[{a.severity.value}] {a.message[:120]}",
        })
    items.sort(key=lambda x: x["timestamp"], reverse=True)
    return items[:limit]


@router.get("/charts/progress-trend")
def progress_trend(db: Annotated[Session, Depends(get_db)], user: CurrentUser, project_id: int | None = None, days: int = 90):
    project_ids = [project_id] if project_id else db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        return []
    since = datetime.now() - timedelta(days=days)
    rows = db.execute(
        select(cast(ProgressAnalysis.analysis_date, Date).label("d"),
               func.avg(ProgressAnalysis.predicted_progress_percentage))
        .where(ProgressAnalysis.project_id.in_(project_ids), ProgressAnalysis.analysis_date >= since)
        .group_by("d").order_by("d")
    ).all()
    return [{"date": d, "value": float(v or 0)} for d, v in rows]


@router.get("/charts/cost-trend")
def cost_trend(db: Annotated[Session, Depends(get_db)], user: CurrentUser, project_id: int | None = None, days: int = 90):
    project_ids = [project_id] if project_id else db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        return []
    since = datetime.now() - timedelta(days=days)
    rows = db.execute(
        select(BudgetRecord.expense_date.label("d"), func.coalesce(func.sum(BudgetRecord.amount), 0))
        .where(BudgetRecord.project_id.in_(project_ids), BudgetRecord.expense_date >= since.date())
        .group_by(BudgetRecord.expense_date).order_by(BudgetRecord.expense_date)
    ).all()
    return [{"date": d, "value": float(v or 0)} for d, v in rows]


@router.get("/charts/stage-distribution")
def stage_distribution(db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    project_ids = db.scalars(_scope(select(Project.id), user)).all()
    if not project_ids:
        return []
    distribution: dict[str, int] = {}
    for pid in project_ids:
        latest = db.scalars(
            select(ProgressAnalysis).where(ProgressAnalysis.project_id == pid)
            .order_by(desc(ProgressAnalysis.analysis_date)).limit(1)
        ).first()
        if latest and latest.predicted_stage:
            distribution[latest.predicted_stage] = distribution.get(latest.predicted_stage, 0) + 1
    return [{"stage": k, "count": v} for k, v in distribution.items()]

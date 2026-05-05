from typing import Annotated
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_manager_or_admin
from app.models.project import Project, ProjectStatus, ProjectAssignee
from app.models.user import User, UserRole
from app.models.stage import ConstructionStage, ProjectStage
from app.models.image import SiteImage
from app.models.alert import Alert
from app.models.analysis import ProgressAnalysis
from app.models.cost import CostEstimation
from app.models.budget import BudgetRecord
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectStatusUpdate, ProjectSummary,
    AssigneeIn, AssigneeOut,
)
from app.services.cost_estimation import total_recorded_expenses
from app.services.audit import log_action
from app.services.access import scope_projects, user_can_access

router = APIRouter(prefix="/projects", tags=["projects"])


# Project listing/visibility uses the shared `scope_projects` helper from
# `services.access` so dashboard, budget, alerts, etc. apply the same rule.
def _scope_to_user(stmt, user: User):
    return scope_projects(stmt, user)


def _user_can_access(db: Session, project: Project, user: User) -> bool:
    return user_can_access(db, project.id, user)


def _user_can_manage_team(db: Session, project: Project, user: User) -> bool:
    """Owners (creator) and admins can add/remove assignees."""
    if user.role == UserRole.admin:
        return True
    return project.created_by == user.id


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: ProjectStatus | None = Query(None, alias="status"),
    search: str | None = None,
):
    stmt = select(Project)
    stmt = _scope_to_user(stmt, user)
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((Project.project_name.ilike(like)) | (Project.project_code.ilike(like)))
    stmt = stmt.order_by(desc(Project.created_at)).offset(skip).limit(limit)
    return db.scalars(stmt).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_access(db, p, user):
        raise HTTPException(403, "You are not assigned to this project.")
    return p


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    if db.scalar(select(Project).where(Project.project_code == payload.project_code)):
        raise HTTPException(409, "Project code already exists")
    p = Project(**payload.model_dump(), created_by=user.id)
    db.add(p)
    db.flush()

    # Auto-instantiate the 7 master stages onto this project with planned budget allocations.
    master_stages = db.scalars(select(ConstructionStage).order_by(ConstructionStage.stage_order)).all()
    for s in master_stages:
        ps = ProjectStage(
            project_id=p.id,
            stage_id=s.id,
            allocated_budget=(p.total_budget or Decimal("0")) * (s.expected_cost_percentage / Decimal("100")),
        )
        db.add(ps)

    # Owner is auto-added as an assignee so they can access the project under
    # the new membership-based scoping rule. Admins implicitly have access.
    db.add(ProjectAssignee(project_id=p.id, user_id=user.id, assigned_by=user.id))

    log_action(db, user.id, "project.create", "project", p.id, details={"name": p.project_name})
    db.commit()
    db.refresh(p)
    return p


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    log_action(db, user.id, "project.update", "project", p.id, details=list(data.keys()))
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    db.delete(p)
    log_action(db, user.id, "project.delete", "project", project_id)
    db.commit()


@router.patch("/{project_id}/status", response_model=ProjectOut)
def patch_status(
    project_id: int,
    payload: ProjectStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.status = payload.status
    if payload.status == ProjectStatus.completed and not p.actual_end_date:
        p.actual_end_date = date.today()
    log_action(db, user.id, "project.status_change", "project", p.id, details={"to": payload.status.value})
    db.commit()
    db.refresh(p)
    return p


@router.get("/{project_id}/summary", response_model=ProjectSummary)
def project_summary(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_access(db, p, user):
        raise HTTPException(403, "You are not assigned to this project.")

    total_spent = total_recorded_expenses(db, p.id)
    latest_a = db.scalars(
        select(ProgressAnalysis)
        .where(ProgressAnalysis.project_id == p.id)
        .order_by(ProgressAnalysis.analysis_date.desc()).limit(1)
    ).first()
    latest_e = db.scalars(
        select(CostEstimation)
        .where(CostEstimation.project_id == p.id)
        .order_by(CostEstimation.generated_at.desc()).limit(1)
    ).first()
    images_count = db.scalar(select(func.count()).select_from(SiteImage).where(SiteImage.project_id == p.id)) or 0
    alerts_count = db.scalar(select(func.count()).select_from(Alert).where(Alert.project_id == p.id)) or 0
    open_alerts = db.scalar(
        select(func.count()).select_from(Alert).where(Alert.project_id == p.id, Alert.resolved_at.is_(None))
    ) or 0

    return ProjectSummary(
        project=p,
        total_expenses=total_spent,
        latest_progress=float(latest_a.predicted_progress_percentage) if latest_a and latest_a.predicted_progress_percentage is not None else None,
        latest_confidence=float(latest_a.confidence_score) if latest_a and latest_a.confidence_score is not None else None,
        deviation_status=latest_e.deviation_status.value if latest_e else None,
        images_count=images_count,
        alerts_count=alerts_count,
        open_alerts_count=open_alerts,
    )


@router.get("/{project_id}/timeline")
def project_timeline(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_access(db, p, user):
        raise HTTPException(403, "You are not assigned to this project.")
    rows = db.execute(
        select(ProjectStage, ConstructionStage)
        .join(ConstructionStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(ProjectStage.project_id == project_id)
        .order_by(ConstructionStage.stage_order)
    ).all()
    return [
        {
            "stage_order": s.stage_order,
            "stage_name": s.stage_name,
            "expected_progress": float(s.expected_progress_percentage),
            "expected_cost_percent": float(s.expected_cost_percentage),
            "planned_start_date": ps.planned_start_date,
            "planned_end_date": ps.planned_end_date,
            "actual_start_date": ps.actual_start_date,
            "actual_end_date": ps.actual_end_date,
            "allocated_budget": float(ps.allocated_budget),
            "actual_cost": float(ps.actual_cost),
            "status": ps.status.value,
        }
        for ps, s in rows
    ]


@router.get("/{project_id}/stages")
def list_project_stages(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    return project_timeline(project_id, db, user)


@router.get("/{project_id}/stages/progress")
def stages_progress(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    timeline = project_timeline(project_id, db, user)
    completed = sum(1 for s in timeline if s["status"] == "completed")
    return {
        "total_stages": len(timeline),
        "completed_stages": completed,
        "progress_percent_by_stage_count": (completed / len(timeline) * 100) if timeline else 0.0,
    }


# ----------------------------- assignees / team --------------------------- #

def _serialise_assignee(a: ProjectAssignee, u: User) -> AssigneeOut:
    return AssigneeOut(
        id=a.id,
        project_id=a.project_id,
        user_id=a.user_id,
        user_full_name=u.full_name,
        user_email=u.email,
        user_role=u.role.value if hasattr(u.role, "value") else str(u.role),
        assigned_by=a.assigned_by,
        assigned_at=a.assigned_at,
    )


@router.get("/{project_id}/assignees", response_model=list[AssigneeOut])
def list_assignees(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_access(db, p, user):
        raise HTTPException(403, "You are not assigned to this project.")
    rows = db.scalars(
        select(ProjectAssignee).where(ProjectAssignee.project_id == project_id)
    ).all()
    out: list[AssigneeOut] = []
    for a in rows:
        u = db.get(User, a.user_id)
        if u is None:
            continue
        out.append(_serialise_assignee(a, u))
    return out


@router.post("/{project_id}/assignees", response_model=AssigneeOut, status_code=status.HTTP_201_CREATED)
def add_assignee(
    project_id: int,
    payload: AssigneeIn,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_manage_team(db, p, user):
        raise HTTPException(403, "Only the project owner or an admin can manage the team.")
    target = db.get(User, payload.user_id)
    if target is None or not target.is_active:
        raise HTTPException(404, "User not found or inactive")
    existing = db.scalar(
        select(ProjectAssignee).where(
            ProjectAssignee.project_id == project_id,
            ProjectAssignee.user_id == payload.user_id,
        )
    )
    if existing is not None:
        return _serialise_assignee(existing, target)
    a = ProjectAssignee(
        project_id=project_id, user_id=payload.user_id, assigned_by=user.id
    )
    db.add(a)
    db.flush()
    log_action(
        db, user.id, "project.assignee_add", "project", project_id,
        details={"user_id": payload.user_id},
    )
    db.commit()
    db.refresh(a)
    return _serialise_assignee(a, target)


@router.delete("/{project_id}/assignees/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_assignee(
    project_id: int,
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _user_can_manage_team(db, p, user):
        raise HTTPException(403, "Only the project owner or an admin can manage the team.")
    if user_id == p.created_by:
        raise HTTPException(400, "Cannot remove the project owner.")
    a = db.scalar(
        select(ProjectAssignee).where(
            ProjectAssignee.project_id == project_id,
            ProjectAssignee.user_id == user_id,
        )
    )
    if a is None:
        raise HTTPException(404, "Assignee not found")
    db.delete(a)
    log_action(
        db, user.id, "project.assignee_remove", "project", project_id,
        details={"user_id": user_id},
    )
    db.commit()

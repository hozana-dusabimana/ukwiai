from typing import Annotated
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin
from app.core.config import settings
from app.models.user import User
from app.models.project import Project
from app.models.image import SiteImage
from app.models.analysis import ProgressAnalysis
from app.models.budget import BudgetRecord
from app.models.alert import Alert
from app.models.audit import AuditLog
from app.services.ai_client import ai_client, AIServiceError

router = APIRouter(tags=["system"])


@router.get("/system/health")
async def health(db: Annotated[Session, Depends(get_db)]):
    db_ok = True
    try:
        db.execute(select(1)).scalar()
    except Exception:
        db_ok = False
    ai_ok = True
    ai_info: dict | None = None
    try:
        ai_info = await ai_client.health()
    except AIServiceError:
        ai_ok = False
    except Exception:
        ai_ok = False
    return {
        "status": "ok" if db_ok and ai_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "ai_service": "ok" if ai_ok else "error",
        "ai_info": ai_info,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/system/stats")
def stats(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    return {
        "users": db.scalar(select(func.count()).select_from(User)) or 0,
        "projects": db.scalar(select(func.count()).select_from(Project)) or 0,
        "images": db.scalar(select(func.count()).select_from(SiteImage)) or 0,
        "analyses": db.scalar(select(func.count()).select_from(ProgressAnalysis)) or 0,
        "expenses": db.scalar(select(func.count()).select_from(BudgetRecord)) or 0,
        "alerts": db.scalar(select(func.count()).select_from(Alert)) or 0,
    }


@router.get("/audit-logs")
def audit_logs(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user_id: int | None = None,
    action: str | None = None,
):
    stmt = select(AuditLog)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    rows = db.scalars(stmt.order_by(desc(AuditLog.timestamp)).offset(skip).limit(limit)).all()
    return [
        {
            "id": r.id, "user_id": r.user_id, "action": r.action,
            "entity_type": r.entity_type, "entity_id": r.entity_id,
            "ip_address": r.ip_address, "timestamp": r.timestamp, "details": r.details,
        } for r in rows
    ]


@router.get("/system/settings")
def get_settings_view(_: Annotated[User, Depends(require_admin)]):
    """Expose tunable thresholds (read-only here; changing them needs env redeploy)."""
    return {
        "budget_overrun_percent": settings.BUDGET_OVERRUN_PERCENT,
        "delay_alert_days": settings.DELAY_ALERT_DAYS,
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
        "ai_service_url": settings.AI_SERVICE_URL,
        "environment": settings.ENVIRONMENT,
    }


@router.put("/system/settings")
def update_settings(_: Annotated[User, Depends(require_admin)]):
    """Per spec, but server config is sourced from env. Returns a hint to redeploy."""
    return {"message": "System settings are sourced from environment variables; update .env and redeploy."}

from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_manager_or_admin
from app.models.alert import Alert, AlertSeverity, AlertType
from app.models.notification import Notification
from app.models.user import User
from app.schemas.alert import AlertOut, NotificationOut

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    project_id: int | None = None,
    severity: AlertSeverity | None = None,
    alert_type: AlertType | None = None,
    unresolved_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(Alert)
    if project_id:
        stmt = stmt.where(Alert.project_id == project_id)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    if alert_type:
        stmt = stmt.where(Alert.alert_type == alert_type)
    if unresolved_only:
        stmt = stmt.where(Alert.resolved_at.is_(None))
    stmt = stmt.order_by(desc(Alert.triggered_at)).offset(skip).limit(limit)
    return db.scalars(stmt).all()


@router.get("/alerts/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    return a


@router.patch("/alerts/{alert_id}/read", response_model=AlertOut)
def mark_read(alert_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    a.is_read = True
    db.commit()
    db.refresh(a)
    return a


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertOut)
def resolve(
    alert_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    a.resolved_at = datetime.now()
    a.is_read = True
    db.commit()
    db.refresh(a)
    return a


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    db.delete(a)
    db.commit()


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return db.scalars(stmt.order_by(desc(Notification.created_at)).limit(limit)).all()


@router.patch("/notifications/{notif_id}/read", response_model=NotificationOut)
def mark_notification_read(notif_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    n = db.get(Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n

from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.alert import AlertType, AlertSeverity


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    alert_type: AlertType
    severity: AlertSeverity
    message: str
    is_read: bool
    triggered_at: datetime
    resolved_at: datetime | None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    title: str
    message: str | None
    type: str | None
    is_read: bool
    link: str | None
    created_at: datetime

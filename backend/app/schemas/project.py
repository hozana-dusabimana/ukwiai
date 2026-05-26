from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict
from app.models.project import ProjectStatus, CourtType


class ProjectBase(BaseModel):
    project_name: str = Field(min_length=2, max_length=200)
    project_code: str = Field(min_length=2, max_length=50)
    location: str | None = None
    client_name: str | None = None
    court_type: CourtType = CourtType.outdoor
    court_dimensions: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    total_budget: Decimal = Field(ge=0, default=Decimal("0"))
    description: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    project_name: str | None = None
    project_code: str | None = None
    location: str | None = None
    client_name: str | None = None
    court_type: CourtType | None = None
    court_dimensions: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    actual_end_date: date | None = None
    total_budget: Decimal | None = None
    status: ProjectStatus | None = None
    description: str | None = None


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: ProjectStatus
    actual_end_date: date | None
    created_by: int
    created_at: datetime
    updated_at: datetime


class ProjectSummary(BaseModel):
    project: ProjectOut
    total_expenses: Decimal
    # AI-derived: refreshed on each /api/ai/analyze-image. Zero until first analysis.
    total_ai_inferred_cost: Decimal = Decimal("0")
    # Effective = max(recorded, ai). Use this in UI cards.
    effective_total_spent: Decimal = Decimal("0")
    latest_progress: float | None
    latest_confidence: float | None
    deviation_status: str | None
    images_count: int
    alerts_count: int
    open_alerts_count: int


class AssigneeIn(BaseModel):
    user_id: int


class AssigneeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    user_id: int
    user_full_name: str
    user_email: str
    user_role: str
    assigned_by: int
    assigned_at: datetime

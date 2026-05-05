from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict
from app.models.stage import ProjectStageStatus


class ConstructionStageBase(BaseModel):
    stage_name: str = Field(min_length=2, max_length=150)
    stage_order: int = Field(ge=1)
    expected_progress_percentage: Decimal = Field(ge=0, le=100)
    expected_cost_percentage: Decimal = Field(ge=0, le=100)
    description: str | None = None


class ConstructionStageCreate(ConstructionStageBase):
    pass


class ConstructionStageUpdate(BaseModel):
    stage_name: str | None = None
    stage_order: int | None = None
    expected_progress_percentage: Decimal | None = None
    expected_cost_percentage: Decimal | None = None
    description: str | None = None


class ConstructionStageOut(ConstructionStageBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProjectStageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    stage_id: int
    stage: ConstructionStageOut | None = None
    planned_start_date: date | None
    planned_end_date: date | None
    actual_start_date: date | None
    actual_end_date: date | None
    allocated_budget: Decimal
    actual_cost: Decimal
    status: ProjectStageStatus


class ProjectStageUpdate(BaseModel):
    planned_start_date: date | None = None
    planned_end_date: date | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    allocated_budget: Decimal | None = None
    actual_cost: Decimal | None = None
    status: ProjectStageStatus | None = None

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from app.models.cost import DeviationStatus


class CostEstimationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    image_id: int | None
    estimated_progress: Decimal | None
    estimated_cost_used: Decimal | None
    actual_cost_recorded: Decimal | None
    variance: Decimal | None
    predicted_remaining_budget: Decimal | None
    projected_total_cost: Decimal | None
    deviation_status: DeviationStatus
    generated_at: datetime


class CostComparison(BaseModel):
    estimated_cost_used: Decimal
    actual_cost_recorded: Decimal
    variance: Decimal
    variance_percent: float
    deviation_status: DeviationStatus

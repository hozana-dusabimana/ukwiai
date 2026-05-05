from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class DashboardOverview(BaseModel):
    total_projects: int
    active_projects: int
    completed_projects: int
    total_budget: Decimal
    total_spent: Decimal
    remaining_budget: Decimal
    average_progress: float
    over_budget_count: int
    on_track_count: int
    under_budget_count: int


class TrendPoint(BaseModel):
    date: date
    value: float


class StageDistributionItem(BaseModel):
    stage: str
    count: int

from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict
from app.models.budget import ExpenseCategory


class ExpenseBase(BaseModel):
    expense_category: ExpenseCategory
    amount: Decimal = Field(gt=0)
    description: str | None = None
    expense_date: date
    stage_id: int | None = None
    receipt_url: str | None = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    expense_category: ExpenseCategory | None = None
    amount: Decimal | None = None
    description: str | None = None
    expense_date: date | None = None
    stage_id: int | None = None
    receipt_url: str | None = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    recorded_by: int
    created_at: datetime


class BudgetSummary(BaseModel):
    total_budget: Decimal
    total_spent: Decimal
    remaining: Decimal
    spent_percent: float
    by_category: dict[str, Decimal]
    by_stage: dict[str, Decimal]

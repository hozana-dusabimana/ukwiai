from datetime import datetime, date
from decimal import Decimal
import enum
from sqlalchemy import String, DateTime, Date, Numeric, Integer, Text, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExpenseCategory(str, enum.Enum):
    materials = "materials"
    labor = "labor"
    equipment = "equipment"
    transport = "transport"
    other = "other"


class BudgetRecord(Base):
    __tablename__ = "budget_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("construction_stages.id"), nullable=True)
    expense_category: Mapped[ExpenseCategory] = mapped_column(
        SAEnum(ExpenseCategory, native_enum=False, length=20), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    recorded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    project = relationship("Project", back_populates="expenses")
    stage = relationship("ConstructionStage")
    recorder = relationship("User")

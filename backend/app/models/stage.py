from datetime import date
from decimal import Decimal
import enum
from sqlalchemy import String, Text, Date, Numeric, Integer, ForeignKey, UniqueConstraint, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProjectStageStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"
    delayed = "delayed"


class ConstructionStage(Base):
    __tablename__ = "construction_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stage_name: Mapped[str] = mapped_column(String(150), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    expected_progress_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    expected_cost_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class ProjectStage(Base):
    __tablename__ = "project_stages"
    __table_args__ = (UniqueConstraint("project_id", "stage_id", name="uq_project_stage"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id: Mapped[int] = mapped_column(Integer, ForeignKey("construction_stages.id"), nullable=False)
    planned_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    allocated_budget: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"), nullable=False)
    actual_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"), nullable=False)
    # Spend inferred from the latest AI analysis (per-stage). Refreshed after each call to
    # /api/ai/analyze-image so the budget breakdown can show non-zero values even before
    # an accountant logs real BudgetRecord rows. Kept separate from actual_cost so that
    # recorded expenses (additive) and AI inference (overwritten each run) don't fight.
    ai_inferred_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"), nullable=False)
    # Market-priced prediction of what this stage actually costs to build at this
    # site — material BOM × market index × terrain difficulty, rolled up to the
    # stage's current progress. Unlike `allocated_budget` (the plan) and
    # `ai_inferred_cost` (a % of the plan), this is grounded in real material
    # prices and CAN exceed the planned allocation. Drives over-budget alerts.
    ai_predicted_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"), nullable=False)
    status: Mapped[ProjectStageStatus] = mapped_column(
        SAEnum(ProjectStageStatus, native_enum=False, length=20),
        default=ProjectStageStatus.not_started,
        nullable=False,
    )

    project = relationship("Project", back_populates="project_stages")
    stage = relationship("ConstructionStage")

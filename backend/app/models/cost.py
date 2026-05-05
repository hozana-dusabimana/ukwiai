from datetime import datetime
from decimal import Decimal
import enum
from sqlalchemy import DateTime, Numeric, Integer, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DeviationStatus(str, enum.Enum):
    under = "under"
    on_track = "on_track"
    over = "over"


class CostEstimation(Base):
    __tablename__ = "cost_estimations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    image_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("site_images.id", ondelete="SET NULL"), nullable=True)
    estimated_progress: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    estimated_cost_used: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    actual_cost_recorded: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    variance: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    predicted_remaining_budget: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    projected_total_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    deviation_status: Mapped[DeviationStatus] = mapped_column(
        SAEnum(DeviationStatus, native_enum=False, length=20),
        default=DeviationStatus.on_track,
        nullable=False,
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    project = relationship("Project", back_populates="estimations")
    image = relationship("SiteImage")

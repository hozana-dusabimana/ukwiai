from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, Numeric, Integer, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProgressAnalysis(Base):
    __tablename__ = "progress_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(Integer, ForeignKey("site_images.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    predicted_stage: Mapped[str | None] = mapped_column(String(150), nullable=True)
    predicted_progress_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    analysis_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_predictions: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    image = relationship("SiteImage", back_populates="analyses")
    project = relationship("Project", back_populates="analyses")

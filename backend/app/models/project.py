from datetime import datetime, date
from decimal import Decimal
import enum
from sqlalchemy import (
    String, DateTime, Date, Numeric, Enum as SAEnum, Integer, Text, ForeignKey,
    UniqueConstraint, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProjectStatus(str, enum.Enum):
    planned = "planned"
    ongoing = "ongoing"
    completed = "completed"
    on_hold = "on_hold"


class CourtType(str, enum.Enum):
    indoor = "indoor"
    outdoor = "outdoor"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    project_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    court_type: Mapped[CourtType] = mapped_column(
        SAEnum(CourtType, native_enum=False, length=20), default=CourtType.outdoor, nullable=False
    )
    court_dimensions: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_budget: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus, native_enum=False, length=20),
        default=ProjectStatus.planned,
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Site terrain (assessed from the background photo uploaded at setup) ---
    # The raw plot photo and the AI's difficulty assessment of it. The
    # difficulty multiplier (≈0.85 easy … 1.80 severe) feeds the cost engine so
    # harder ground inflates the predicted cost of terrain-sensitive stages.
    site_background_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    site_background_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    terrain_difficulty: Mapped[Decimal] = mapped_column(Numeric(5, 3), default=Decimal("1.000"), nullable=False)
    terrain_assessment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    terrain_assessed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    creator = relationship("User", back_populates="projects", foreign_keys=[created_by])
    project_stages = relationship("ProjectStage", back_populates="project", cascade="all, delete-orphan")
    images = relationship("SiteImage", back_populates="project", cascade="all, delete-orphan")
    analyses = relationship("ProgressAnalysis", back_populates="project", cascade="all, delete-orphan")
    expenses = relationship("BudgetRecord", back_populates="project", cascade="all, delete-orphan")
    estimations = relationship("CostEstimation", back_populates="project", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="project", cascade="all, delete-orphan")
    assignees = relationship(
        "ProjectAssignee", back_populates="project", cascade="all, delete-orphan",
        foreign_keys="ProjectAssignee.project_id",
    )


class ProjectAssignee(Base):
    """Per-project access list. A user appears here exactly when they should
    see + work on this project. Admins bypass this table entirely.

    The project owner (created_by) is auto-added on project creation, so the
    "owner sees their own project" rule and the "assignee sees the project"
    rule collapse into a single check at the query layer.
    """

    __tablename__ = "project_assignees"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    project = relationship("Project", back_populates="assignees", foreign_keys=[project_id])
    user = relationship("User", foreign_keys=[user_id])
    assigner = relationship("User", foreign_keys=[assigned_by])

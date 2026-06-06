from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert import Alert, AlertType, AlertSeverity
from app.models.cost import CostEstimation, DeviationStatus
from app.models.project import Project, ProjectAssignee
from app.models.notification import Notification
from app.models.stage import ProjectStage, ConstructionStage, ProjectStageStatus
from app.models.user import User, UserRole


def evaluate_cost_alerts(db: Session, project: Project, estimation: CostEstimation) -> list[Alert]:
    """Trigger budget-related alerts based on a fresh cost estimation."""
    new_alerts: list[Alert] = []

    if estimation.deviation_status == DeviationStatus.over:
        variance = estimation.variance or 0
        budget = project.total_budget or 1
        pct = float(variance) / float(budget) * 100 if float(budget) else 0.0
        severity = AlertSeverity.critical if pct >= 20 else (AlertSeverity.high if pct >= 10 else AlertSeverity.medium)
        a = Alert(
            project_id=project.id,
            alert_type=AlertType.budget_overrun,
            severity=severity,
            message=(
                f"Budget overrun detected: actual spending exceeds AI-estimated cost by "
                f"{variance:.2f} ({pct:.1f}% of total budget)."
            ),
        )
        db.add(a)
        new_alerts.append(a)

    if (
        estimation.projected_total_cost is not None
        and project.total_budget
        and float(estimation.projected_total_cost) > float(project.total_budget) * 1.05
    ):
        over_pct = (
            (float(estimation.projected_total_cost) - float(project.total_budget))
            / float(project.total_budget) * 100
        )
        a = Alert(
            project_id=project.id,
            alert_type=AlertType.anomaly,
            severity=AlertSeverity.high if over_pct >= 15 else AlertSeverity.medium,
            message=(
                f"Forecast warning: projected total cost {estimation.projected_total_cost:.2f} "
                f"exceeds project budget {project.total_budget:.2f} by {over_pct:.1f}%."
            ),
        )
        db.add(a)
        new_alerts.append(a)

    return new_alerts


def evaluate_delay_alerts(db: Session, project: Project) -> list[Alert]:
    """Flag projects that have run past their expected end date."""
    if not project.expected_end_date or project.actual_end_date:
        return []
    days_late = (date.today() - project.expected_end_date).days
    if days_late <= settings.DELAY_ALERT_DAYS:
        return []
    severity = (
        AlertSeverity.critical if days_late >= 30
        else AlertSeverity.high if days_late >= 14
        else AlertSeverity.medium
    )
    a = Alert(
        project_id=project.id,
        alert_type=AlertType.delay,
        severity=severity,
        message=f"Project is {days_late} days past its expected end date ({project.expected_end_date}).",
    )
    db.add(a)
    return [a]


def evaluate_milestone_alerts(db: Session, project: Project) -> list[Alert]:
    """Raise a milestone alert for each stage the AI has marked completed that
    isn't already flagged. Keeps the alerts feed populated during healthy,
    on-budget progress (where no overrun/delay alert would ever fire)."""
    completed = db.execute(
        select(ConstructionStage.stage_name)
        .join(ProjectStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(
            ProjectStage.project_id == project.id,
            ProjectStage.status == ProjectStageStatus.completed,
        )
        .order_by(ConstructionStage.stage_order)
    ).scalars().all()
    if not completed:
        return []

    existing = set(
        db.scalars(
            select(Alert.message).where(
                Alert.project_id == project.id,
                Alert.alert_type == AlertType.milestone,
            )
        ).all()
    )
    new_alerts: list[Alert] = []
    for name in completed:
        message = f"Milestone reached: “{name}” is complete."
        if message in existing:
            continue
        a = Alert(
            project_id=project.id,
            alert_type=AlertType.milestone,
            severity=AlertSeverity.low,
            message=message,
        )
        db.add(a)
        new_alerts.append(a)
    return new_alerts


def _project_recipient_ids(db: Session, project: Project) -> list[int]:
    """Everyone who should hear about this project: its assignees plus all admins."""
    ids = set(
        db.scalars(
            select(ProjectAssignee.user_id).where(ProjectAssignee.project_id == project.id)
        ).all()
    )
    ids.update(
        db.scalars(select(User.id).where(User.role == UserRole.admin)).all()
    )
    return list(ids)


def notify_project_users(
    db: Session,
    project: Project,
    title: str,
    message: str,
    type_: str = "info",
    link: str | None = None,
) -> list[Notification]:
    """Fan a notification out to every user who can see this project."""
    notes = [
        Notification(user_id=uid, title=title, message=message, type=type_, link=link)
        for uid in _project_recipient_ids(db, project)
    ]
    db.add_all(notes)
    return notes


def record_scan_activity(
    db: Session,
    project: Project,
    analysis,
    estimation: CostEstimation,
    new_alerts: list[Alert],
) -> None:
    """After an AI scan: notify project users of the result and surface any
    freshly-raised alerts as notifications too."""
    progress = float(analysis.predicted_progress_percentage or 0)
    stage = analysis.predicted_stage or "Unknown stage"
    notify_project_users(
        db,
        project,
        title=f"AI scan: {project.project_name}",
        message=f"Detected “{stage}” at {progress:.0f}% progress.",
        type_="analysis",
        link="/site-logs",
    )
    for a in new_alerts:
        notify_project_users(
            db,
            project,
            title=f"Alert: {a.alert_type.value.replace('_', ' ').title()}",
            message=a.message,
            type_="alert",
            link="/site-logs",
        )

from __future__ import annotations
from datetime import datetime, date
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert import Alert, AlertType, AlertSeverity
from app.models.cost import CostEstimation, DeviationStatus
from app.models.project import Project


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

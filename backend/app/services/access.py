"""Project-level access checks shared across routers.

Single source of truth for the rule:
    Admin sees every project.
    Everyone else sees only projects where they are a `ProjectAssignee`.

Use `scope_projects(stmt, user)` to filter a SELECT-from-Project statement.
Use `user_can_access(db, project, user)` for per-row checks (used in
`get`-by-id endpoints and per-project sub-resource endpoints like
`/projects/{id}/budget/summary` so a user can't read data on a project
they don't belong to even if they know the id).
"""
from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectAssignee
from app.models.user import User, UserRole


def scope_projects(stmt, user: User):
    """Restrict a SELECT statement on Project (or Project.id) to those the
    given user is allowed to see."""
    if user.role == UserRole.admin:
        return stmt
    member_ids = select(ProjectAssignee.project_id).where(
        ProjectAssignee.user_id == user.id
    )
    return stmt.where(Project.id.in_(member_ids))


def user_can_access(db: Session, project_id: int, user: User) -> bool:
    """True if `user` should be able to read this project's data."""
    if user.role == UserRole.admin:
        return True
    return db.scalar(
        select(ProjectAssignee.id).where(
            ProjectAssignee.project_id == project_id,
            ProjectAssignee.user_id == user.id,
        )
    ) is not None

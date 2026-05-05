"""Database bootstrap — creates DB if missing, builds tables, seeds defaults.

This module is invoked from `main.lifespan` so that running the backend (e.g.
`uvicorn app.main:app` or via Docker) is the only step required to get a fully
functional database. It connects once *without* a database name to issue
`CREATE DATABASE IF NOT EXISTS`, then `Base.metadata.create_all` against the
target DB, and finally seeds the master construction-stage list and the
default admin user when those tables are empty.
"""
from __future__ import annotations
import logging
import time
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base, engine
from app.core.security import hash_password
from app.models.project import Project, ProjectAssignee
from app.models.stage import ConstructionStage
from app.models.user import User, UserRole

logger = logging.getLogger("ukwi.bootstrap")


SEED_STAGES = [
    ("Site Clearing & Excavation",          1,  10.00,  8.00, "Bare ground, machinery present, soil removal visible."),
    ("Sub-base Preparation",                2,  25.00, 12.00, "Gravel layer laid, compacted soil, leveling visible."),
    ("Base Layer / Concrete Slab",          3,  45.00, 25.00, "Poured concrete, formwork, reinforcement bars."),
    ("Surface Finishing (Asphalt/Acrylic)", 4,  65.00, 22.00, "Smooth surface, asphalt coat, acrylic layers visible."),
    ("Court Line Marking & Painting",       5,  80.00, 13.00, "Painted lines, court colors (free-throw, three-point arc)."),
    ("Hoops & Backboards Installation",     6,  92.00, 12.00, "Poles erected, backboards mounted, rims and nets installed."),
    ("Fencing & Final Touches",             7, 100.00,  8.00, "Perimeter fencing, lighting, benches, signage."),
]

DEFAULT_ADMIN_EMAIL = "admin@ukwi.rw"
DEFAULT_ADMIN_PASSWORD = "ChangeMe!2026"
DEFAULT_ADMIN_NAME = "UKWI Administrator"


def _wait_for_server(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    """Block until the MySQL server accepts connections.

    Docker compose orders services with `depends_on: service_healthy`, but when
    the backend is started outside compose (e.g. `uvicorn` against an existing
    DB) we still want a bounded retry loop instead of a stack trace.
    """
    if settings.database_url.startswith("sqlite"):
        return
    server_url = (
        f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/?charset=utf8mb4"
    )
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            tmp = create_engine(server_url, pool_pre_ping=True)
            with tmp.connect() as conn:
                conn.execute(text("SELECT 1"))
            tmp.dispose()
            logger.info("MySQL reachable on attempt %d", attempt)
            return
        except OperationalError as exc:
            last_err = exc
            logger.info("MySQL not ready (attempt %d/%d): %s", attempt, max_attempts, exc.orig)
            time.sleep(delay_seconds)
    raise RuntimeError(f"MySQL not reachable after {max_attempts} attempts: {last_err}")


def _create_database_if_missing() -> None:
    """Issue CREATE DATABASE IF NOT EXISTS against the MySQL server."""
    if settings.database_url.startswith("sqlite"):
        return
    server_url = (
        f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/?charset=utf8mb4"
    )
    server_engine = create_engine(server_url, pool_pre_ping=True)
    with server_engine.connect() as conn:
        conn.execute(text(
            f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        ))
        conn.commit()
    server_engine.dispose()
    logger.info("Database '%s' ready", settings.DB_NAME)


def _create_tables() -> None:
    """Run create_all under a MySQL named lock so concurrent Gunicorn workers
    do not race each other into duplicate-CREATE-TABLE errors. SQLite has no
    such lock primitive, but it also has no multi-process bootstrap need.
    """
    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
        logger.info("Schema synced — %d tables", len(Base.metadata.tables))
        return

    lock_name = f"ukwi_bootstrap_{settings.DB_NAME}"
    with engine.begin() as conn:
        got = conn.execute(text("SELECT GET_LOCK(:n, 30)"), {"n": lock_name}).scalar()
        if got != 1:
            logger.warning("Could not acquire bootstrap lock — another worker is running it")
            return
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Schema synced — %d tables", len(Base.metadata.tables))
        finally:
            conn.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": lock_name})


def _seed(session_factory) -> None:
    """Insert seed rows. Uses a MySQL named lock for safety under concurrent
    workers; the in-row `WHERE email=...`/`stage_order in (...)` checks make
    it idempotent regardless.
    """
    lock_name = f"ukwi_seed_{settings.DB_NAME}"
    is_mysql = not settings.database_url.startswith("sqlite")
    with session_factory() as db:
        if is_mysql:
            got = db.execute(text("SELECT GET_LOCK(:n, 30)"), {"n": lock_name}).scalar()
            if got != 1:
                logger.warning("Could not acquire seed lock — another worker is seeding")
                return
        try:
            existing_orders = {row.stage_order for row in db.query(ConstructionStage).all()}
            for name, order, prog_pct, cost_pct, desc in SEED_STAGES:
                if order in existing_orders:
                    continue
                db.add(ConstructionStage(
                    stage_name=name,
                    stage_order=order,
                    expected_progress_percentage=Decimal(str(prog_pct)),
                    expected_cost_percentage=Decimal(str(cost_pct)),
                    description=desc,
                ))
            admin = db.query(User).filter(User.email == DEFAULT_ADMIN_EMAIL).one_or_none()
            if admin is None:
                db.add(User(
                    full_name=DEFAULT_ADMIN_NAME,
                    email=DEFAULT_ADMIN_EMAIL,
                    password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                    role=UserRole.admin,
                    is_active=True,
                ))
                logger.info("Seeded default admin %s (CHANGE THIS PASSWORD AFTER FIRST LOGIN)", DEFAULT_ADMIN_EMAIL)
            db.commit()

            # Backfill: every existing project must have its creator as an
            # assignee under the new membership-scoped access rules. Idempotent
            # — only inserts the missing rows.
            backfilled = 0
            for proj in db.query(Project).all():
                exists = db.query(ProjectAssignee).filter(
                    ProjectAssignee.project_id == proj.id,
                    ProjectAssignee.user_id == proj.created_by,
                ).first()
                if exists is None:
                    db.add(ProjectAssignee(
                        project_id=proj.id,
                        user_id=proj.created_by,
                        assigned_by=proj.created_by,
                    ))
                    backfilled += 1
            if backfilled:
                db.commit()
                logger.info("Backfilled %d project_assignees rows for existing projects", backfilled)
        finally:
            if is_mysql:
                db.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": lock_name})
                db.commit()


def bootstrap() -> None:
    """Top-level entry: server-up wait, DB creation, schema sync, seed."""
    try:
        _wait_for_server()
        _create_database_if_missing()
        _create_tables()
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        _seed(SessionLocal)
        logger.info("Bootstrap complete")
    except SQLAlchemyError as exc:
        logger.exception("Bootstrap failed: %s", exc)
        raise

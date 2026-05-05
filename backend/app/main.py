from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
# Import models so they are registered on Base.metadata
from app import models  # noqa: F401

from app.api.v1 import (
    auth, users, projects, stages, images, ai, budget, cost,
    dashboard, alerts, reports, system,
)

logger = logging.getLogger("ukwi")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.REPORTS_DIR).mkdir(parents=True, exist_ok=True)

    if os.environ.get("UKWI_SKIP_BOOTSTRAP") != "1":
        from app.core.bootstrap import bootstrap
        bootstrap()
    logger.info("UKWI backend starting up — env=%s", settings.ENVIRONMENT)
    yield
    logger.info("UKWI backend shutting down")


app = FastAPI(
    title="UKWI Construction Monitor API",
    version="1.0.0",
    description="AI-Based Construction Progress & Budget Monitoring System for UKWI Company Ltd.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(SQLAlchemyError)
async def db_exception_handler(_: Request, exc: SQLAlchemyError):
    logger.exception("DB error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Database error"})


# Routers — all under /api
API = "/api"
app.include_router(auth.router, prefix=API)
app.include_router(users.router, prefix=API)
app.include_router(projects.router, prefix=API)
app.include_router(stages.router, prefix=API)
app.include_router(images.router, prefix=API)
app.include_router(ai.router, prefix=API)
app.include_router(budget.router, prefix=API)
app.include_router(cost.router, prefix=API)
app.include_router(dashboard.router, prefix=API)
app.include_router(alerts.router, prefix=API)
app.include_router(reports.router, prefix=API)
app.include_router(system.router, prefix=API)


@app.get("/", tags=["root"])
async def root():
    return {
        "name": "UKWI Construction Monitor API",
        "version": app.version,
        "docs": "/docs",
        "health": "/api/system/health",
    }

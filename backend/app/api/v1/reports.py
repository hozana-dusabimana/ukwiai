from typing import Annotated
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_manager_or_admin
from app.models.project import Project
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportGenerateRequest, ReportOut
from app.services.reports import generate_pdf_report, generate_excel_report
from app.services.audit import log_action

router = APIRouter(tags=["reports"])


@router.post("/reports/generate", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def generate_report(
    payload: ReportGenerateRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, payload.project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if payload.format == "pdf":
        rep = generate_pdf_report(db, p, user.id, payload.report_type)
    else:
        rep = generate_excel_report(db, p, user.id, payload.report_type)
    log_action(db, user.id, "report.generate", "report", rep.id, details={"type": payload.report_type, "format": payload.format})
    db.commit()
    db.refresh(rep)
    return rep


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    project_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    stmt = select(Report)
    if project_id:
        stmt = stmt.where(Report.project_id == project_id)
    return db.scalars(stmt.order_by(desc(Report.generated_at)).offset(skip).limit(limit)).all()


_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".csv": "text/csv",
}


@router.get("/reports/{report_id}/download")
def download(report_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    p = Path(r.file_path)
    if not p.exists():
        raise HTTPException(410, "Report file no longer exists")

    # Read the whole file into memory and respond with a plain Response. This
    # guarantees the entire body + headers are written in one atomic flush
    # which dev proxies (Vite) sometimes mishandle when relaying streamed
    # FileResponses and the browser sees ERR_CONNECTION_RESET.
    data = p.read_bytes()
    media_type = _MEDIA_TYPES.get(p.suffix.lower(), "application/octet-stream")
    # RFC 6266: ASCII filename + UTF-8 fallback for non-ASCII characters.
    safe_name = quote(p.name)
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{p.name}"; filename*=UTF-8\'\'{safe_name}',
            "Content-Length": str(len(data)),
            "Cache-Control": "private, max-age=0, no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/projects/{project_id}/reports/progress", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def progress_pdf(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    rep = generate_pdf_report(db, p, user.id, "progress")
    db.commit()
    db.refresh(rep)
    return rep


@router.post("/projects/{project_id}/reports/budget", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def budget_report(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
    fmt: str = Query("pdf", pattern="^(pdf|excel)$"),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    rep = generate_pdf_report(db, p, user.id, "budget") if fmt == "pdf" else generate_excel_report(db, p, user.id, "budget")
    db.commit()
    db.refresh(rep)
    return rep


@router.post("/projects/{project_id}/reports/full", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def full_report(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    rep = generate_pdf_report(db, p, user.id, "full")
    db.commit()
    db.refresh(rep)
    return rep

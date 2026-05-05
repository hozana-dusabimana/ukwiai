from typing import Annotated
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, desc
from sqlalchemy.orm import Session
import jwt

from app.core.database import get_db
from app.core.deps import CurrentUser, require_manager_or_admin
from app.core.security import decode_token
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


# Bearer scheme that does NOT raise on missing header so we can fall back
# to the `?token=` query parameter. Used only for the download endpoint.
_optional_bearer = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _user_for_download(
    db: Annotated[Session, Depends(get_db)],
    bearer_token: Annotated[str | None, Depends(_optional_bearer)] = None,
    token: str | None = Query(default=None, description="JWT access token (alternative to Authorization header)"),
) -> User:
    """Auth resolver that accepts either a Bearer header (axios/fetch path)
    or a ?token= query parameter (plain `<a href>` / `window.open` path —
    crucial when AV/proxy/extensions kill XHR-with-Authorization flows)."""
    raw = bearer_token or token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(raw)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Wrong token type")
        user_id = int(payload.get("sub"))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    u = db.get(User, user_id)
    if u is None or not u.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return u


@router.get("/reports/{report_id}/download")
def download(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(_user_for_download)],
):
    """Serve a generated report file.

    Accepts auth via Bearer header *or* `?token=` query parameter so View /
    Download buttons can use plain navigation (window.open / <a href>) when
    the JS-with-Authorization-header path is blocked by AV, extensions, or
    a finicky dev proxy.
    """
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    p = Path(r.file_path)
    if not p.exists():
        raise HTTPException(410, "Report file no longer exists")

    # Read whole file into memory and respond atomically (no streaming —
    # avoids Vite/http-proxy-middleware mishandling on some dev setups).
    data = p.read_bytes()
    media_type = _MEDIA_TYPES.get(p.suffix.lower(), "application/octet-stream")
    safe_name = quote(p.name)
    log_action(db, user.id, "report.download", "report", r.id)
    db.commit()
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

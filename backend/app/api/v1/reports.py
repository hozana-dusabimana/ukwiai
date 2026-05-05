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


def _read_report(db: Session, report_id: int) -> tuple[Report, bytes, str, Path]:
    """Common loader: 404/410 + bytes + media type + path."""
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    p = Path(r.file_path)
    if not p.exists():
        raise HTTPException(410, "Report file no longer exists")
    data = p.read_bytes()
    media_type = _MEDIA_TYPES.get(p.suffix.lower(), "application/octet-stream")
    return r, data, media_type, p


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
    r, data, media_type, p = _read_report(db, report_id)
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


def _html_wrapper(title: str, body: str) -> str:
    """Tiny dark-themed HTML shell shared by /view and /save."""
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>{title} — UKWI Monitor</title>
<style>
  html,body {{ margin:0; padding:0; height:100%; background:#0f172a; color:#e2e8f0; font-family:system-ui,sans-serif }}
  .msg {{ max-width:560px; margin:80px auto; padding:24px; background:#1e293b; border-radius:8px; text-align:center }}
  .msg h1 {{ font-size:18px; margin:0 0 8px }}
  .msg p  {{ color:#94a3b8; line-height:1.5 }}
  .btn {{ display:inline-block; margin-top:16px; padding:10px 18px; background:#3a7ca5;
         color:#fff; border-radius:6px; text-decoration:none; font-weight:600 }}
  .btn:hover {{ background:#2c5d80 }}
</style></head><body>{body}</body></html>"""


@router.get("/reports/{report_id}/view")
def view_in_html_wrapper(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(_user_for_download)],
):
    """Serve the report wrapped in an HTML page with the file embedded as a
    base64 data: URL. This sidesteps:

    - AV 'web shield' modules that inspect application/pdf responses and
      can RST the connection (text/html is ignored by most).
    - Browser PDF viewers that misbehave when window.open'd against a raw
      application/pdf response through a dev proxy.

    The embedded data never leaves the user's browser as a separate network
    request — it's invisible to network middleware.
    """
    import base64
    r, data, media_type, p = _read_report(db, report_id)
    log_action(db, user.id, "report.view", "report", r.id)
    db.commit()
    b64 = base64.b64encode(data).decode("ascii")
    title = p.name
    is_pdf = media_type == "application/pdf"
    body = (
        f'<iframe src="data:application/pdf;base64,{b64}" '
        f'style="border:0;width:100vw;height:100vh"></iframe>'
        if is_pdf
        else (
            f'<div class="msg">'
            f'  <h1>{title}</h1>'
            f'  <p>This file type ({media_type}) cannot be previewed inline in the browser.</p>'
            f'  <a class="btn" download="{title}" '
            f'     href="data:{media_type};base64,{b64}">⬇️ Download {title}</a>'
            f'</div>'
        )
    )
    return Response(content=_html_wrapper(title, body), media_type="text/html; charset=utf-8")


@router.get("/reports/{report_id}/save")
def save_via_html_wrapper(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(_user_for_download)],
):
    """Trigger a Save-As via an HTML page that auto-clicks an `<a download>`
    pointing at the file embedded as a base64 data: URL.

    Same rationale as /view — the network response is text/html, the
    actual binary never crosses the wire as application/pdf, so AV
    web-shields don't reset the connection.
    """
    import base64
    r, data, media_type, p = _read_report(db, report_id)
    log_action(db, user.id, "report.download", "report", r.id)
    db.commit()
    b64 = base64.b64encode(data).decode("ascii")
    title = p.name
    body = f"""<div class="msg">
      <h1>📄 Saving {title}…</h1>
      <p>If your download doesn't start automatically, click the button below.</p>
      <a id="dl" class="btn" download="{title}" href="data:{media_type};base64,{b64}">
        ⬇️ Download {title}
      </a>
      <p style="margin-top:24px;font-size:12px;color:#64748b">
        You can close this tab once the file is saved.
      </p>
    </div>
    <script>
      // Trigger the download programmatically the moment the page loads.
      // Some browsers require a synthetic click on a real anchor element.
      window.addEventListener('load', function() {{
        var a = document.getElementById('dl');
        if (a) a.click();
      }});
    </script>"""
    return Response(content=_html_wrapper(title, body), media_type="text/html; charset=utf-8")


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

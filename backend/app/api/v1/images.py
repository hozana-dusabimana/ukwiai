from typing import Annotated
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.deps import CurrentUser, require_engineer_plus
from app.models.image import SiteImage
from app.models.project import Project
from app.models.user import User
from app.schemas.image import SiteImageOut
from app.services.storage import save_image_bytes
from app.services.audit import log_action
from app.services.access import user_can_access

router = APIRouter(tags=["images"])


def _check_project_access(db: Session, project_id: int, user: User) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not user_can_access(db, project_id, user):
        raise HTTPException(403, "You are not assigned to this project.")
    return p


@router.post("/projects/{project_id}/images/upload", response_model=SiteImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
    file: UploadFile = File(...),
    captured_date: datetime | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    weather_conditions: str | None = Form(None),
    notes: str | None = Form(None),
):
    _check_project_access(db, project_id, user)
    data = await file.read()
    try:
        info = save_image_bytes(project_id, file.filename or "image.jpg", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    img = SiteImage(
        project_id=project_id,
        image_path=info["image_path"],
        image_url=info["image_url"],
        captured_date=captured_date or datetime.now(),
        uploaded_by=user.id,
        latitude=Decimal(str(latitude)) if latitude is not None else None,
        longitude=Decimal(str(longitude)) if longitude is not None else None,
        weather_conditions=weather_conditions,
        notes=notes,
        file_size=info["file_size"],
        original_filename=info["original_filename"],
    )
    db.add(img)
    log_action(db, user.id, "image.upload", "site_image", entity_id=None, details={"project_id": project_id})
    db.commit()
    db.refresh(img)
    return img


@router.post("/images/bulk-upload", response_model=list[SiteImageOut], status_code=status.HTTP_201_CREATED)
async def bulk_upload(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
    project_id: int = Form(...),
    files: list[UploadFile] = File(...),
):
    _check_project_access(db, project_id, user)
    saved: list[SiteImage] = []
    for f in files:
        try:
            data = await f.read()
            info = save_image_bytes(project_id, f.filename or "image.jpg", data)
        except ValueError:
            continue
        img = SiteImage(
            project_id=project_id,
            image_path=info["image_path"],
            image_url=info["image_url"],
            captured_date=datetime.now(),
            uploaded_by=user.id,
            file_size=info["file_size"],
            original_filename=info["original_filename"],
        )
        db.add(img)
        saved.append(img)
    log_action(db, user.id, "image.bulk_upload", "site_image", details={"count": len(saved)})
    db.commit()
    for s in saved:
        db.refresh(s)
    return saved


@router.get("/projects/{project_id}/images", response_model=list[SiteImageOut])
def list_images(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    _check_project_access(db, project_id, user)
    stmt = (
        select(SiteImage)
        .where(SiteImage.project_id == project_id)
        .order_by(desc(SiteImage.captured_date), desc(SiteImage.id))
        .offset(skip).limit(limit)
    )
    return db.scalars(stmt).all()


@router.get("/images/{image_id}", response_model=SiteImageOut)
def get_image(image_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    img = db.get(SiteImage, image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    _check_project_access(db, img.project_id, user)
    return img


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
):
    img = db.get(SiteImage, image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    p = Path(img.image_path)
    if p.exists():
        try:
            p.unlink()
        except OSError:
            pass
    db.delete(img)
    log_action(db, user.id, "image.delete", "site_image", image_id)
    db.commit()


@router.get("/images/{image_id}/download")
def download_image(image_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    img = db.get(SiteImage, image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    _check_project_access(db, img.project_id, user)
    p = Path(img.image_path)
    if not p.exists():
        raise HTTPException(410, "File no longer on disk")
    return FileResponse(str(p), filename=img.original_filename or p.name)


@router.get("/images/file/{project_id}/{filename}")
def serve_image_file(project_id: int, filename: str):
    """Serve raw image bytes by path. Used by `<img src>` tags in the frontend.

    These URLs contain a uuid component generated at upload, so they're not
    enumerable. For stricter access control, swap this for signed URLs (S3-style)
    or proxy via an authenticated streaming endpoint.
    """
    base = (Path(settings.UPLOAD_DIR) / f"project_{project_id}").resolve()
    target = (base / filename).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(400, "Invalid path")
    if not target.exists():
        raise HTTPException(404, "Image file missing")
    return FileResponse(str(target))

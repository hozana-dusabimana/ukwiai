from typing import Annotated
from datetime import datetime
from decimal import Decimal
import time

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin, require_engineer_plus
from app.models.image import SiteImage
from app.models.project import Project
from app.models.analysis import ProgressAnalysis
from app.models.user import User
from app.schemas.analysis import ProgressAnalysisOut, AnalyzeResponse
from app.services.ai_client import ai_client, AIServiceError
from app.services.cost_estimation import compute_cost_estimation
from app.services.alerts import evaluate_cost_alerts
from app.services.audit import log_action
from app.services.storage import read_image_bytes, save_image_bytes

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/model-info")
async def model_info():
    try:
        return await ai_client.model_info()
    except AIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/analyze-image", response_model=AnalyzeResponse)
async def analyze_image(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
    image_id: int | None = Form(None),
    project_id: int | None = Form(None),
    file: UploadFile | None = File(None),
):
    """Analyze either an already-uploaded image (by id) OR a new image upload.

    If `file` is supplied, it gets persisted as a SiteImage first.
    """
    if image_id is None and file is None:
        raise HTTPException(400, "Provide either image_id or a file upload")

    image: SiteImage | None = None
    if image_id is not None:
        image = db.get(SiteImage, image_id)
        if not image:
            raise HTTPException(404, "Image not found")
        proj = db.get(Project, image.project_id)
        img_bytes = read_image_bytes(image.image_path)
        filename = image.original_filename or "image.jpg"
    else:
        if project_id is None:
            raise HTTPException(400, "project_id is required when uploading a new file")
        proj = db.get(Project, project_id)
        if not proj:
            raise HTTPException(404, "Project not found")
        img_bytes = await file.read()
        try:
            info = save_image_bytes(project_id, file.filename or "image.jpg", img_bytes)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        image = SiteImage(
            project_id=project_id,
            image_path=info["image_path"],
            image_url=info["image_url"],
            captured_date=datetime.now(),
            uploaded_by=user.id,
            file_size=info["file_size"],
            original_filename=info["original_filename"],
        )
        db.add(image)
        db.flush()
        filename = file.filename or "image.jpg"

    if proj is None:
        raise HTTPException(404, "Project not found")

    t0 = time.perf_counter()
    try:
        ai_resp = await ai_client.predict(img_bytes, filename=filename)
    except AIServiceError as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    analysis = ProgressAnalysis(
        image_id=image.id,
        project_id=proj.id,
        predicted_stage=ai_resp.get("predicted_stage"),
        predicted_progress_percentage=Decimal(str(ai_resp.get("predicted_progress", 0))),
        confidence_score=Decimal(str(ai_resp.get("confidence", 0))),
        model_version=ai_resp.get("model_version"),
        processing_time_ms=ai_resp.get("processing_time_ms", elapsed_ms),
        raw_predictions=ai_resp.get("raw_predictions"),
    )
    db.add(analysis)
    db.flush()

    estimation = compute_cost_estimation(db, proj, analysis.predicted_progress_percentage, image=image)
    evaluate_cost_alerts(db, proj, estimation)

    log_action(db, user.id, "ai.analyze", "image", image.id, details={"project_id": proj.id})
    db.commit()
    db.refresh(analysis)

    return AnalyzeResponse(
        analysis=analysis,
        cost_estimation_id=estimation.id,
        summary=ai_resp.get("summary"),
        advice=ai_resp.get("advice"),
        next_stage=ai_resp.get("next_stage"),
        confidence_label=ai_resp.get("confidence_label"),
    )


@router.post("/analyze-batch")
async def analyze_batch(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
    project_id: int = Form(...),
    image_ids: str = Form(..., description="Comma-separated image ids"),
):
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    ids = [int(x) for x in image_ids.split(",") if x.strip().isdigit()]
    images = db.scalars(select(SiteImage).where(SiteImage.id.in_(ids), SiteImage.project_id == project_id)).all()
    if not images:
        raise HTTPException(404, "No matching images")

    payload = [(img.original_filename or "image.jpg", read_image_bytes(img.image_path)) for img in images]
    try:
        results = await ai_client.predict_batch(payload)
    except AIServiceError as exc:
        raise HTTPException(503, str(exc))

    out: list[ProgressAnalysisOut] = []
    for img, r in zip(images, results):
        a = ProgressAnalysis(
            image_id=img.id,
            project_id=project_id,
            predicted_stage=r.get("predicted_stage"),
            predicted_progress_percentage=Decimal(str(r.get("predicted_progress", 0))),
            confidence_score=Decimal(str(r.get("confidence", 0))),
            model_version=r.get("model_version"),
            processing_time_ms=r.get("processing_time_ms"),
            raw_predictions=r.get("raw_predictions"),
        )
        db.add(a)
        db.flush()
        compute_cost_estimation(db, proj, a.predicted_progress_percentage, image=img)
        out.append(ProgressAnalysisOut.model_validate(a))
    log_action(db, user.id, "ai.analyze_batch", "project", project_id, details={"count": len(out)})
    db.commit()
    return out


@router.get("/analysis/{analysis_id}", response_model=ProgressAnalysisOut)
def get_analysis(analysis_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    a = db.get(ProgressAnalysis, analysis_id)
    if not a:
        raise HTTPException(404, "Analysis not found")
    return a


@router.get("/projects/{project_id}/analysis-history", response_model=list[ProgressAnalysisOut])
def history(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    return db.scalars(
        select(ProgressAnalysis)
        .where(ProgressAnalysis.project_id == project_id)
        .order_by(desc(ProgressAnalysis.analysis_date))
        .offset(skip).limit(limit)
    ).all()


@router.post("/predict-stage")
async def predict_stage(
    file: UploadFile = File(...),
    user: User = Depends(require_engineer_plus),
):
    """Stateless prediction: upload an image, get a prediction, no persistence."""
    data = await file.read()
    try:
        return await ai_client.predict(data, filename=file.filename or "image.jpg")
    except AIServiceError as exc:
        raise HTTPException(503, str(exc))


@router.post("/retrain", status_code=status.HTTP_202_ACCEPTED)
async def retrain(_: Annotated[User, Depends(require_admin)]):
    """Retraining is a long-running offline job. Endpoint records the request only.

    A real deployment dispatches this onto a worker queue (e.g. Celery + Redis).
    """
    return {"message": "Retrain request accepted. Run training pipeline manually inside ai_service."}

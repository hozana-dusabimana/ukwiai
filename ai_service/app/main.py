from typing import Any
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException

from .predictor import get_predictor
from .stages import STAGES
from .terrain import assess_terrain
from .object_detection import _load_pipeline as _preload_owlv2

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ai-service")

app = FastAPI(
    title="UKWI AI Service",
    description="Computer-vision microservice for basketball-court progress estimation.",
    version="1.0.0",
)


@app.on_event("startup")
def _startup() -> None:
    """Warm-load OWLv2 in the background so first /predict doesn't pay the
    600 MB model-download tax synchronously. If the load fails (no GPU, no
    cache, no torch), the predictor silently falls back to heuristics-only."""
    try:
        _preload_owlv2()
    except Exception as exc:
        logger.warning("OWLv2 preload skipped: %s", exc)


@app.get("/health")
def health() -> dict[str, Any]:
    p = get_predictor()
    return {"status": "ok", "ready": p.is_ready(), "using_fallback": p._using_fallback}


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    return get_predictor().info()


@app.get("/stages")
def stages() -> list[dict[str, Any]]:
    return [
        {
            "order": s.order, "name": s.name,
            "progress_lo": s.progress_lo, "progress_hi": s.progress_hi,
            "cost_pct": s.cost_pct, "description": s.description,
        }
        for s in STAGES
    ]


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    area_m2: float | None = Form(None),
    perimeter_m: float | None = Form(None),
    terrain_multiplier: float = Form(1.0),
    market_index: float | None = Form(None),
) -> dict[str, Any]:
    """Predict the construction stage, progress, visible materials and a
    market-priced cost estimate for the photo.

    The optional cost-context form fields let the caller (the backend) price the
    bill of materials against the real court geometry, the site's terrain
    difficulty, and the current market index. Omitting them falls back to a
    standard outdoor court at nominal market and flat terrain.
    """
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    try:
        return get_predictor().predict(
            data,
            area_m2=area_m2,
            perimeter_m=perimeter_m,
            terrain_multiplier=terrain_multiplier,
            market_index=market_index,
        )
    except ValueError as exc:
        raise HTTPException(400, f"Invalid image: {exc}")
    except Exception as exc:
        logger.exception("Predict failed")
        raise HTTPException(500, f"Inference error: {exc}")


@app.post("/assess-terrain")
async def assess_terrain_endpoint(file: UploadFile = File(...)) -> dict[str, Any]:
    """Analyse a site-background photo into a terrain difficulty multiplier.

    Called at project setup with the photo of the raw plot. The returned
    multiplier is stored on the project and fed back into /predict so every
    cost estimate reflects how hard the ground actually is to build on.
    """
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    try:
        return assess_terrain(data)
    except ValueError as exc:
        raise HTTPException(400, f"Invalid image: {exc}")
    except Exception as exc:
        logger.exception("Terrain assessment failed")
        raise HTTPException(500, f"Terrain analysis error: {exc}")


@app.post("/predict-batch")
async def predict_batch(files: list[UploadFile] = File(...)) -> list[dict[str, Any]]:
    if not files:
        raise HTTPException(400, "No files provided")
    blobs = [await f.read() for f in files]
    return get_predictor().predict_batch(blobs)

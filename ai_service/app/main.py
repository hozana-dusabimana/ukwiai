from typing import Any
import asyncio
import logging
import os
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

# ---------------------------------------------------------------------------
# Inference concurrency guard
# ---------------------------------------------------------------------------
# OWLv2 inference is heavy and CPU-bound. The service runs a single uvicorn
# worker, so calling predict() *synchronously* in the async handler blocks the
# event loop for the whole inference — which means a burst of concurrent
# /predict requests queues up unbounded and starves even /health, making the
# whole service look "down". (This is exactly how a multi-worker eval, or a few
# users uploading at once, wedged it.)
#
# Two defences:
#   1. Run the blocking inference in a worker thread (`asyncio.to_thread`) so the
#      event loop — and /health — stay responsive during inference.
#   2. Bound concurrency with a semaphore and a queue cap: at most
#      AI_MAX_CONCURRENT_INFER inferences run at once, with at most
#      AI_MAX_QUEUED_INFER more waiting; anything beyond that is shed with a fast
#      503 instead of piling up. Load is rejected, never wedged.
_MAX_CONCURRENT_INFER = max(1, int(os.environ.get("AI_MAX_CONCURRENT_INFER", "2")))
_MAX_QUEUED_INFER = max(0, int(os.environ.get("AI_MAX_QUEUED_INFER", "8")))
_infer_sem = asyncio.Semaphore(_MAX_CONCURRENT_INFER)
_inflight = 0  # running + waiting; guarded by the event loop (single-threaded)


async def _run_inference(fn, *args, **kwargs):
    """Run a blocking predictor call under the concurrency guard.

    Fast-fails with 503 when the service is already saturated so callers retry
    instead of the request backlog growing without bound and freezing the worker.
    """
    global _inflight
    if _inflight >= _MAX_CONCURRENT_INFER + _MAX_QUEUED_INFER:
        raise HTTPException(
            status_code=503,
            detail="AI service is busy (too many concurrent analyses). Please retry shortly.",
        )
    _inflight += 1
    try:
        async with _infer_sem:
            return await asyncio.to_thread(fn, *args, **kwargs)
    finally:
        _inflight -= 1


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
        return await _run_inference(
            get_predictor().predict,
            data,
            area_m2=area_m2,
            perimeter_m=perimeter_m,
            terrain_multiplier=terrain_multiplier,
            market_index=market_index,
        )
    except HTTPException:
        raise  # 503 busy / other explicit statuses pass through untouched
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
        # Terrain is OpenCV-only (no OWLv2) but still blocking — run it off the
        # event loop too so it can't stall /health under load.
        return await _run_inference(assess_terrain, data)
    except HTTPException:
        raise
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
    try:
        return await _run_inference(get_predictor().predict_batch, blobs)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Batch predict failed")
        raise HTTPException(500, f"Inference error: {exc}")

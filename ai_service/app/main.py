from typing import Any
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException

from .predictor import get_predictor
from .stages import STAGES

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ai-service")

app = FastAPI(
    title="UKWI AI Service",
    description="Computer-vision microservice for basketball-court progress estimation.",
    version="1.0.0",
)


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
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    try:
        return get_predictor().predict(data)
    except ValueError as exc:
        raise HTTPException(400, f"Invalid image: {exc}")
    except Exception as exc:
        logger.exception("Predict failed")
        raise HTTPException(500, f"Inference error: {exc}")


@app.post("/predict-batch")
async def predict_batch(files: list[UploadFile] = File(...)) -> list[dict[str, Any]]:
    if not files:
        raise HTTPException(400, "No files provided")
    blobs = [await f.read() for f in files]
    return get_predictor().predict_batch(blobs)

from __future__ import annotations
import uuid
from io import BytesIO
from pathlib import Path
from datetime import datetime
from PIL import Image as PILImage

from app.core.config import settings


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _ensure_upload_dir() -> Path:
    p = Path(settings.UPLOAD_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _project_dir(project_id: int) -> Path:
    p = _ensure_upload_dir() / f"project_{project_id}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def validate_image_filename(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type {ext}. Allowed: {sorted(ALLOWED_EXTENSIONS)}")
    return ext


def save_image_bytes(project_id: int, original_filename: str, data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise ValueError(f"File too large: {len(data)} bytes (max {MAX_BYTES})")
    ext = validate_image_filename(original_filename)

    # Reject anything that isn't a real, decodable image.
    try:
        PILImage.open(BytesIO(data)).verify()
    except Exception as exc:
        raise ValueError(f"Invalid image: {exc}")

    out_dir = _project_dir(project_id)
    new_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    fpath = out_dir / new_name
    with open(fpath, "wb") as f:
        f.write(data)

    return {
        "image_path": str(fpath),
        "image_url": f"/api/images/file/{project_id}/{new_name}",
        "file_size": len(data),
        "original_filename": original_filename,
    }


def read_image_bytes(image_path: str) -> bytes:
    with open(image_path, "rb") as f:
        return f.read()

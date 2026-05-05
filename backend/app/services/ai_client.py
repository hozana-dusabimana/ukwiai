import httpx
from typing import Any

from app.core.config import settings


class AIServiceError(Exception):
    pass


class AIServiceClient:
    """Thin async wrapper around the AI inference microservice."""

    def __init__(self, base_url: str | None = None, timeout: float = 30.0):
        self.base_url = (base_url or settings.AI_SERVICE_URL).rstrip("/")
        self.timeout = timeout

    async def health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(f"{self.base_url}/health")
            r.raise_for_status()
            return r.json()

    async def model_info(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(f"{self.base_url}/model-info")
            r.raise_for_status()
            return r.json()

    async def predict(self, image_bytes: bytes, filename: str = "image.jpg") -> dict[str, Any]:
        files = {"file": (filename, image_bytes, "image/jpeg")}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                r = await client.post(f"{self.base_url}/predict", files=files)
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError as exc:
                raise AIServiceError(f"AI service request failed: {exc}") from exc

    async def predict_batch(self, images: list[tuple[str, bytes]]) -> list[dict[str, Any]]:
        files = [("files", (name, data, "image/jpeg")) for name, data in images]
        async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
            try:
                r = await client.post(f"{self.base_url}/predict-batch", files=files)
                r.raise_for_status()
                return r.json()
            except httpx.HTTPError as exc:
                raise AIServiceError(f"AI batch request failed: {exc}") from exc


ai_client = AIServiceClient()

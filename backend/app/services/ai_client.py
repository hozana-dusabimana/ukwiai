import httpx
from typing import Any

from app.core.config import settings


class AIServiceError(Exception):
    pass


class AIServiceClient:
    """Thin async wrapper around the AI inference microservice."""

    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        self.base_url = (base_url or settings.AI_SERVICE_URL).rstrip("/")
        self.timeout = timeout if timeout is not None else settings.AI_SERVICE_TIMEOUT

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

    async def predict(
        self,
        image_bytes: bytes,
        filename: str = "image.jpg",
        *,
        area_m2: float | None = None,
        perimeter_m: float | None = None,
        terrain_multiplier: float | None = None,
        market_index: float | None = None,
    ) -> dict[str, Any]:
        files = {"file": (filename, image_bytes, "image/jpeg")}
        # Cost-context: the court geometry + terrain difficulty + market index so
        # the AI prices the bill of materials against this specific site.
        data: dict[str, str] = {}
        if area_m2 is not None:
            data["area_m2"] = str(area_m2)
        if perimeter_m is not None:
            data["perimeter_m"] = str(perimeter_m)
        if terrain_multiplier is not None:
            data["terrain_multiplier"] = str(terrain_multiplier)
        if market_index is not None:
            data["market_index"] = str(market_index)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                r = await client.post(f"{self.base_url}/predict", files=files, data=data or None)
                r.raise_for_status()
                return r.json()
            except httpx.TimeoutException as exc:
                raise AIServiceError(
                    f"AI service timed out after {self.timeout:.0f}s "
                    "(model may still be loading or inference is too slow)"
                ) from exc
            except httpx.HTTPError as exc:
                raise AIServiceError(f"AI service request failed: {exc!r}") from exc

    async def assess_terrain(self, image_bytes: bytes, filename: str = "site.jpg") -> dict[str, Any]:
        """Analyse a site-background photo into a terrain difficulty assessment."""
        files = {"file": (filename, image_bytes, "image/jpeg")}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                r = await client.post(f"{self.base_url}/assess-terrain", files=files)
                r.raise_for_status()
                return r.json()
            except httpx.TimeoutException as exc:
                raise AIServiceError(
                    f"AI service timed out after {self.timeout:.0f}s during terrain assessment"
                ) from exc
            except httpx.HTTPError as exc:
                raise AIServiceError(f"AI terrain request failed: {exc!r}") from exc

    async def predict_batch(self, images: list[tuple[str, bytes]]) -> list[dict[str, Any]]:
        files = [("files", (name, data, "image/jpeg")) for name, data in images]
        async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
            try:
                r = await client.post(f"{self.base_url}/predict-batch", files=files)
                r.raise_for_status()
                return r.json()
            except httpx.TimeoutException as exc:
                raise AIServiceError(
                    f"AI service timed out after {self.timeout * 2:.0f}s "
                    "(model may still be loading or inference is too slow)"
                ) from exc
            except httpx.HTTPError as exc:
                raise AIServiceError(f"AI batch request failed: {exc!r}") from exc


ai_client = AIServiceClient()

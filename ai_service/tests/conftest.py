import io
import pytest
from PIL import Image


@pytest.fixture
def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (240, 240), color=(120, 90, 60)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def green_paint_png() -> bytes:
    """Bright saturated paint-like image — should bias the heuristic toward line-marking stage."""
    buf = io.BytesIO()
    Image.new("RGB", (240, 240), color=(20, 200, 80)).save(buf, format="PNG")
    return buf.getvalue()

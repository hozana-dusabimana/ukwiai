import numpy as np
from app.preprocessing import preprocess, decode_image, letterbox


def test_preprocess_shape_and_dtype(png_bytes):
    arr = preprocess(png_bytes, input_size=224)
    assert arr.shape == (1, 224, 224, 3)
    assert arr.dtype == np.float32
    assert arr.min() >= 0.0 and arr.max() <= 1.0


def test_decode_image_returns_bgr(png_bytes):
    img = decode_image(png_bytes)
    assert img.ndim == 3 and img.shape[2] == 3


def test_letterbox_preserves_aspect():
    arr = np.zeros((100, 200, 3), dtype=np.uint8)
    out = letterbox(arr, 224)
    assert out.shape == (224, 224, 3)


def test_preprocess_rejects_bad_bytes():
    import pytest
    with pytest.raises(Exception):
        preprocess(b"not an image")

"""Image preprocessing pipeline used by both inference and training.

Pipeline:
  1. Decode bytes (BGR via OpenCV).
  2. Convert to RGB.
  3. Resize to (input_size, input_size) preserving aspect ratio with letterbox.
  4. Light Gaussian blur to suppress sensor noise.
  5. Optional sharpening for low-light/blurry images.
  6. Normalize to [0, 1] floats.
"""
from __future__ import annotations
import cv2
import numpy as np
from io import BytesIO


def decode_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return img


def letterbox(img: np.ndarray, size: int) -> np.ndarray:
    h, w = img.shape[:2]
    scale = min(size / w, size / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    top = (size - nh) // 2
    left = (size - nw) // 2
    canvas[top:top + nh, left:left + nw] = resized
    return canvas


def is_low_light(img_rgb: np.ndarray, threshold: float = 60.0) -> bool:
    return float(img_rgb.mean()) < threshold


def sharpen(img: np.ndarray) -> np.ndarray:
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(img, -1, kernel)


def preprocess(data: bytes, input_size: int = 224) -> np.ndarray:
    """Return a (1, input_size, input_size, 3) float32 tensor in [0, 1]."""
    bgr = decode_image(data)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    rgb = letterbox(rgb, input_size)
    rgb = cv2.GaussianBlur(rgb, (3, 3), sigmaX=0.5)
    if is_low_light(rgb):
        rgb = sharpen(rgb)
    arr = rgb.astype(np.float32) / 255.0
    return np.expand_dims(arr, axis=0)

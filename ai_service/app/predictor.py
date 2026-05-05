"""Singleton predictor with lazy model loading and a safe heuristic fallback.

If a trained model file does not exist (typical in a fresh dev environment before
data labelling is complete), the predictor falls back to a deterministic colour
& edge-density heuristic. The heuristic is intentionally crude — it is meant to
keep the rest of the system functional end-to-end so the team can develop the
backend and frontend in parallel with model training.
"""
from __future__ import annotations
import logging
import os
import threading
import time
from typing import Any

import numpy as np

from .preprocessing import preprocess, decode_image
from .stages import STAGES, stage_for_index, NUM_CLASSES, stage_midpoint

logger = logging.getLogger("ai-predictor")
_LOCK = threading.Lock()


_STAGE_ADVICE = {
    1: "Confirm dimensions match the project plan before sub-base material is delivered.",
    2: "Inspect compaction with the engineer; capture before/after photos for the audit log.",
    3: "Verify rebar spacing and concrete cure time before approving the next pour.",
    4: "Schedule the line-marking crew and confirm acrylic stocks are on site.",
    5: "Validate court dimensions against FIBA/local standards; sign off colour scheme with client.",
    6: "Stress-test pole anchors and rim height (3.05 m) before practice access is granted.",
    7: "Walk the perimeter for fence integrity, drainage, and lighting commissioning.",
}


def _confidence_label(c: float) -> str:
    if c >= 0.80:
        return "high"
    if c >= 0.55:
        return "moderate"
    if c >= 0.35:
        return "low"
    return "very_low"


def _human_summary(stage, progress: float, confidence: float, next_stage,
                   *, using_fallback: bool) -> tuple[str, str]:
    """Build a friendly, evidence-style summary and an actionable next-step note.

    The summary mirrors what a site engineer would write in a daily log; the
    advice is an explicit next action so dashboards can surface it directly.
    """
    cl = _confidence_label(confidence)
    pct = round(progress, 1)

    if cl == "high":
        certainty = "The image clearly shows"
    elif cl == "moderate":
        certainty = "The image most likely shows"
    elif cl == "low":
        certainty = "The image weakly suggests"
    else:
        certainty = "Unclear image — best guess is"

    summary = (
        f"{certainty} stage {stage.order} — {stage.name}. "
        f"Estimated overall progress: {pct}%. "
        f"Confidence: {cl} ({confidence:.0%})."
    )
    if next_stage:
        summary += f" The next planned stage is {next_stage.name}."

    if using_fallback:
        summary += " (Heuristic fallback in use — train the CNN for higher accuracy.)"

    advice = _STAGE_ADVICE.get(stage.order, "Continue routine monitoring.")
    if cl in ("low", "very_low"):
        advice = (
            "Re-shoot the photo with better light and a wider angle, "
            "ideally from the centre line of the court. Then re-run analysis. "
            f"Tentative next step if the stage holds: {advice}"
        )
    return summary, advice


class Predictor:
    def __init__(self, model_path: str, model_version: str, input_size: int = 224):
        self.model_path = model_path
        self.model_version = model_version
        self.input_size = input_size
        self._model = None
        self._using_fallback = True

    def is_ready(self) -> bool:
        return self._model is not None or self._using_fallback

    def info(self) -> dict[str, Any]:
        return {
            "model_version": self.model_version,
            "model_path": self.model_path,
            "input_size": self.input_size,
            "num_classes": NUM_CLASSES,
            "stages": [{"order": s.order, "name": s.name, "progress_lo": s.progress_lo, "progress_hi": s.progress_hi} for s in STAGES],
            "using_fallback": self._using_fallback,
        }

    def _load_model_if_needed(self) -> None:
        if self._model is not None or not os.path.exists(self.model_path):
            return
        try:
            from .model_arch import load_model  # heavy import — only when we have a model
            with _LOCK:
                if self._model is None:
                    logger.info("Loading model from %s", self.model_path)
                    self._model = load_model(self.model_path)
                    self._using_fallback = False
        except Exception as exc:
            logger.exception("Failed to load model — falling back to heuristic. (%s)", exc)
            self._model = None
            self._using_fallback = True

    # ----------------- public prediction entry points -----------------
    def predict(self, image_bytes: bytes) -> dict[str, Any]:
        self._load_model_if_needed()
        t0 = time.perf_counter()
        if self._model is not None:
            tensor = preprocess(image_bytes, self.input_size)
            stage_probs, progress_pred = self._model.predict(tensor, verbose=0)
            stage_probs = stage_probs[0]
            cls_idx = int(np.argmax(stage_probs))
            confidence = float(stage_probs[cls_idx])
            stage = stage_for_index(cls_idx)
            progress = float(progress_pred[0][0])
            progress = max(stage.progress_lo, min(stage.progress_hi, progress))
            raw = {f"stage_{i+1}": float(p) for i, p in enumerate(stage_probs)}
        else:
            stage, progress, confidence, raw = self._heuristic(image_bytes)

        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        next_stage = STAGES[stage.order] if stage.order < NUM_CLASSES else None
        summary, advice = _human_summary(stage, progress, confidence, next_stage,
                                          using_fallback=self._using_fallback)

        return {
            "predicted_stage": stage.name,
            "predicted_stage_order": stage.order,
            "predicted_progress": round(progress, 2),
            "confidence": round(confidence, 4),
            "confidence_label": _confidence_label(confidence),
            "summary": summary,
            "advice": advice,
            "next_stage": next_stage.name if next_stage else None,
            "model_version": self.model_version + ("-fallback" if self._using_fallback else ""),
            "processing_time_ms": elapsed_ms,
            "raw_predictions": raw,
        }

    def predict_batch(self, image_bytes_list: list[bytes]) -> list[dict[str, Any]]:
        return [self.predict(b) for b in image_bytes_list]

    # ----------------- fallback heuristic -----------------
    def _heuristic(self, image_bytes: bytes):
        """Hand-crafted features that correlate with the seven construction stages.

        Used only when no trained CNN is available. Outputs a per-stage probability
        vector, an interpolated progress percentage *within* the predicted stage's
        band (not just the midpoint), and a calibrated confidence based on the
        top-2 margin in the score vector.

        Features:
          soil      — warm hue, mid saturation (stages 1-2: clearing, sub-base)
          gravel    — low saturation, mid value, high local texture (stage 2)
          concrete  — low saturation, high value, low texture (stage 3)
          asphalt   — very dark uniform regions (stage 4)
          paint     — high-saturation bright pixels (stage 5)
          metal     — bright + low-saturation specks with high edges (stage 6)
          fence     — high vertical-edge density across regular spacings (stage 7)
        """
        import cv2
        bgr = decode_image(image_bytes)
        bgr = cv2.resize(bgr, (self.input_size, self.input_size))
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)

        total = h.size
        # Soil — warm hue (orange-brown), mid saturation. Excludes bright reds.
        soil_mask = ((h >= 5) & (h <= 25) & (s > 40) & (s < 180) & (v > 50) & (v < 200)).astype(np.uint8)
        # Gravel — low saturation, mid value, textured.
        gravel_mask = ((s < 50) & (v > 80) & (v < 170)).astype(np.uint8)
        # Concrete — low saturation, high value, smooth (we check texture separately).
        concrete_mask = ((s < 35) & (v > 150) & (v < 230)).astype(np.uint8)
        # Asphalt — uniformly dark.
        asphalt_mask = ((s < 60) & (v < 75)).astype(np.uint8)
        # Bright vivid paint — needs HIGH saturation AND value, AND outside the warm-soil hue band
        # to avoid bare-earth getting tagged as paint.
        paint_mask = ((s > 130) & (v > 140) & ((h < 5) | (h > 28))).astype(np.uint8)
        # Metal — low-saturation specular highlights.
        metal_mask = ((s < 30) & (v > 200)).astype(np.uint8)

        soil = float(soil_mask.sum()) / total
        gravel = float(gravel_mask.sum()) / total
        concrete = float(concrete_mask.sum()) / total
        asphalt = float(asphalt_mask.sum()) / total
        paint = float(paint_mask.sum()) / total
        metal = float(metal_mask.sum()) / total

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        edge_density = float(edges.sum()) / (255.0 * total)

        # Vertical-edge bias: poles/hoops/fence posts produce strong vertical lines.
        sobel_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        vert_bias = float(np.abs(sobel_x).sum()) / max(1.0, float(np.abs(sobel_y).sum()))

        # Line-marking only makes sense when there's an asphalt/concrete BASE under the paint.
        # Without that, isolated bright pixels are almost certainly something else.
        line_marking_signal = paint * 2.0 * (asphalt + concrete + 0.2)

        # Score each stage. Coefficients were chosen so a representative example
        # for each stage scores highest on its own row.
        scores = np.zeros(NUM_CLASSES, dtype=np.float32)
        scores[0] = soil * 2.0 - concrete * 0.5 - asphalt * 0.5          # bare ground
        scores[1] = soil * 0.5 + gravel * 1.6 - paint * 0.6              # sub-base
        scores[2] = concrete * 2.0 - asphalt * 0.5 - paint * 0.4         # slab
        scores[3] = asphalt * 2.0 - soil * 0.4 - paint * 0.3             # surface finish
        scores[4] = line_marking_signal + asphalt * 0.4 - soil * 0.5     # line marking
        scores[5] = metal * 1.8 + edge_density * 1.0 + max(0.0, vert_bias - 1.0) * 0.6 + paint * 0.3 - soil * 0.4
        scores[6] = edge_density * 1.6 + max(0.0, vert_bias - 1.0) * 1.0 - soil * 0.5 - concrete * 0.3

        # Soft-max with temperature for slightly sharper-but-still-meaningful probs.
        temperature = 0.7
        z = scores / temperature
        e = np.exp(z - z.max())
        probs = e / e.sum()

        idx = int(np.argmax(probs))
        stage = stage_for_index(idx)

        # Interpolate progress *within* the predicted stage's band.
        # Use the relative strength of the chosen stage's score against neighbours
        # as the position within the band.
        sorted_idx = np.argsort(probs)[::-1]
        top1, top2 = probs[sorted_idx[0]], probs[sorted_idx[1]]
        margin = float((top1 - top2) / max(top1, 1e-6))  # 0 = ambiguous, 1 = certain
        # Within-band position: how strongly does this image fit the stage?
        # 0.5 = middle of band, 0 = entering, 1 = leaving.
        position = float(0.3 + 0.7 * margin)
        position = max(0.0, min(1.0, position))
        progress = stage.progress_lo + position * (stage.progress_hi - stage.progress_lo)

        # Calibrated confidence — combine softmax probability with top-2 margin.
        confidence = float(0.5 * top1 + 0.5 * margin)

        raw = {f"stage_{i+1}": float(p) for i, p in enumerate(probs)}
        raw["features"] = {
            "soil": round(soil, 3),
            "gravel": round(gravel, 3),
            "concrete": round(concrete, 3),
            "asphalt": round(asphalt, 3),
            "paint": round(paint, 3),
            "metal": round(metal, 3),
            "edge_density": round(edge_density, 3),
            "vertical_bias": round(vert_bias, 3),
        }
        return stage, progress, confidence, raw


_predictor: Predictor | None = None


def get_predictor() -> Predictor:
    global _predictor
    if _predictor is None:
        model_path = os.environ.get("AI_MODEL_PATH", "/app/models/basketball_court_cnn.h5")
        model_version = os.environ.get("AI_MODEL_VERSION", "1.0.0")
        input_size = int(os.environ.get("AI_INPUT_SIZE", "224"))
        _predictor = Predictor(model_path, model_version, input_size)
    return _predictor

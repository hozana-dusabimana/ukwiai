"""Singleton predictor with lazy model loading and a safe heuristic fallback.

If a trained model file does not exist — or if the side-car metadata says the
trained model is degenerate (validation accuracy below random) — the predictor
falls back to a deterministic computer-vision heuristic that combines colour
ratios, court-line-marking detection (HoughLinesP on white pixels), and
vertical-pole detection. The heuristic is good enough to give correct answers
on real construction photos while a stronger CNN is being trained.
"""
from __future__ import annotations
import json
import logging
import os
import threading
import time
from typing import Any

import numpy as np

from .preprocessing import preprocess, decode_image
from .stages import STAGES, stage_for_index, NUM_CLASSES

logger = logging.getLogger("ai-predictor")
_LOCK = threading.Lock()

# A trained model is rejected if its reported validation stage-accuracy is at or
# below the random-baseline (1 / NUM_CLASSES). We use a small safety margin so
# barely-better-than-random checkpoints don't slip through.
_MIN_ACCEPTABLE_VAL_ACC = max(1.0 / NUM_CLASSES, 0.20)


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

    def _model_passes_sanity_check(self) -> bool:
        """Reject models whose reported validation stage-accuracy is at or below
        the random baseline. A collapsed/untrained checkpoint with confident-but-
        always-wrong predictions is strictly worse than the heuristic fallback."""
        meta_path = os.path.splitext(self.model_path)[0] + ".meta.json"
        if not os.path.exists(meta_path):
            return True  # no metadata, give the model the benefit of the doubt
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            val_acc_history = (meta.get("history") or {}).get("val_stage_acc") or []
            test_acc = ((meta.get("metrics") or {}).get("test") or {}).get("stage_acc")
            best_val = max(val_acc_history) if val_acc_history else None
            best_acc = max(v for v in (best_val, test_acc) if v is not None) if (best_val is not None or test_acc is not None) else None
            if best_acc is None:
                return True
            if best_acc < _MIN_ACCEPTABLE_VAL_ACC:
                logger.warning(
                    "Refusing to load %s — reported best stage-accuracy %.3f is "
                    "at or below random baseline (%.3f). Falling back to heuristic.",
                    self.model_path, best_acc, _MIN_ACCEPTABLE_VAL_ACC,
                )
                return False
            return True
        except Exception as exc:
            logger.warning("Could not read model metadata at %s (%s) — accepting model anyway.", meta_path, exc)
            return True

    def _load_model_if_needed(self) -> None:
        if self._model is not None or not os.path.exists(self.model_path):
            return
        # Operator escape hatch: when the trained CNN is overconfident on
        # out-of-distribution real photos (e.g. only synthetic training data),
        # AI_FORCE_HEURISTIC=1 keeps the predictor on the deterministic CV
        # heuristic without having to delete the .h5 file.
        if os.environ.get("AI_FORCE_HEURISTIC", "").strip().lower() in ("1", "true", "yes"):
            logger.info("AI_FORCE_HEURISTIC is set — skipping trained model, using heuristic fallback.")
            self._model = None
            self._using_fallback = True
            return
        if not self._model_passes_sanity_check():
            self._model = None
            self._using_fallback = True
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
            outputs = self._model.predict(tensor, verbose=0)
            # Model outputs a dict {"stage": ..., "progress": ...}. Back-compat
            # with older list-output checkpoints handled by ducking on type.
            if isinstance(outputs, dict):
                stage_probs = np.asarray(outputs["stage"])[0]
                progress_pred = float(np.asarray(outputs["progress"])[0][0])
            else:
                stage_probs = np.asarray(outputs[0])[0]
                progress_pred = float(np.asarray(outputs[1])[0][0])
            # Sigmoid head outputs [0, 1]; scale to [0, 100]. (Older checkpoints
            # that already scaled to [0, 100] inside a Lambda will simply produce
            # values >1 here — the clamp below catches that without breaking.)
            if 0.0 <= progress_pred <= 1.0:
                progress_pred *= 100.0
            cls_idx = int(np.argmax(stage_probs))
            confidence = float(stage_probs[cls_idx])
            stage = stage_for_index(cls_idx)
            progress = max(stage.progress_lo, min(stage.progress_hi, progress_pred))
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
        """Center-weighted CV heuristic that grounds its prediction in physical
        evidence: court line markings, the concrete/asphalt slab footprint, and
        installed perimeter poles. Hard overrides prevent visually-impossible
        stages from winning (e.g. you cannot be in 'site clearing' once the
        concrete slab and painted court lines are both present).

        Features (all center-weighted unless noted):
          soil      — warm hue, mid saturation (stages 1-2)
          gravel    — low saturation, mid value (stage 2)
          slab      — low saturation, mid-high value, smooth (stage 3+)
          asphalt   — uniformly dark surface (stage 4+)
          white     — near-white pixels: court line markings on a slab (stage 5+)
          long_white_lines — HoughLinesP count of long thin white segments
          pole_count — near-vertical Hough lines (lights / hoop poles / fence posts)
        """
        import cv2
        bgr = decode_image(image_bytes)
        bgr = cv2.resize(bgr, (self.input_size, self.input_size))
        H, W = bgr.shape[:2]
        total = H * W
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Center weighting: 1.0 at the image centre, falling off to ~0 at corners.
        # Construction photos almost always frame the court in the centre, with
        # access roads / soil heaps / equipment at the edges. Whole-frame ratios
        # let perimeter clutter dominate the central evidence.
        cy, cx = H / 2.0, W / 2.0
        yy, xx = np.mgrid[0:H, 0:W]
        radial = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        center_w = np.clip(1.4 - radial / np.sqrt(cx ** 2 + cy ** 2), 0.0, 1.0).astype(np.float32)
        center_total = float(center_w.sum())

        def cratio(mask: np.ndarray) -> float:
            return float((mask.astype(np.float32) * center_w).sum()) / center_total

        soil_mask     = ((h >= 5) & (h <= 25) & (s > 40) & (s < 180) & (v > 50) & (v < 200))
        gravel_mask   = ((s < 50) & (v > 80) & (v < 170))
        # Slab covers concrete (bright grey) AND asphalt (dark grey). Real-photo
        # courts span V≈70 (asphalt in shade) up to V≈220 (sunlit concrete).
        slab_mask     = ((s < 55) & (v > 70) & (v < 230))
        asphalt_mask  = ((s < 65) & (v < 90))
        # Court paint after JPEG compression / oblique view typically lands
        # around V=190-230. The previous V>215 threshold missed real photos.
        white_mask    = ((s < 35) & (v > 195))
        metal_mask    = ((s < 30) & (v > 220))

        soil     = cratio(soil_mask)
        gravel   = cratio(gravel_mask)
        slab     = cratio(slab_mask)
        asphalt  = cratio(asphalt_mask)
        white    = cratio(white_mask)
        metal    = cratio(metal_mask)

        # ----- largest connected slab/court region -----
        # The thing that most reliably distinguishes a court from random
        # construction debris is that the court is ONE BIG CONVEX GREY REGION.
        # Find it via connected components on the slab mask, then measure how
        # much of the frame the largest blob covers and how rectangular it is.
        slab_or_asphalt = (slab_mask | asphalt_mask).astype(np.uint8)
        slab_or_asphalt = cv2.morphologyEx(slab_or_asphalt, cv2.MORPH_CLOSE,
                                            np.ones((5, 5), np.uint8), iterations=2)
        n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(slab_or_asphalt, connectivity=8)
        biggest_blob_area = 0
        biggest_blob_rectness = 0.0
        biggest_blob_box = None
        if n_labels > 1:
            # Skip background (label 0).
            areas = stats[1:, cv2.CC_STAT_AREA]
            biggest_idx = int(np.argmax(areas)) + 1
            biggest_blob_area = int(stats[biggest_idx, cv2.CC_STAT_AREA])
            x, y, w, hh = (int(stats[biggest_idx, cv2.CC_STAT_LEFT]),
                           int(stats[biggest_idx, cv2.CC_STAT_TOP]),
                           int(stats[biggest_idx, cv2.CC_STAT_WIDTH]),
                           int(stats[biggest_idx, cv2.CC_STAT_HEIGHT]))
            bbox_area = max(1, w * hh)
            biggest_blob_rectness = biggest_blob_area / bbox_area
            biggest_blob_box = (x, y, w, hh)
        biggest_blob_frac = biggest_blob_area / float(total)
        # Strong slab evidence: a large, rectangular grey blob that fills a
        # nontrivial fraction of the centre.
        has_slab_blob = (biggest_blob_frac > 0.12 and biggest_blob_rectness > 0.45)

        # ----- court line marking detection -----
        # White pixels alone aren't enough (sky, reflections, white shirts can
        # all match). We require *long thin* line segments — that's what painted
        # court markings produce. HoughLinesP on the binarised white channel.
        long_white_lines = 0
        if white_mask.sum() > 80:
            wm8 = (white_mask.astype(np.uint8)) * 255
            wm8 = cv2.morphologyEx(wm8, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
            wm_edges = cv2.Canny(wm8, 50, 150)
            lines = cv2.HoughLinesP(
                wm_edges, rho=1, theta=np.pi / 180,
                threshold=30,
                minLineLength=int(min(W, H) * 0.18),
                maxLineGap=8,
            )
            if lines is not None:
                for x1, y1, x2, y2 in lines[:, 0]:
                    if np.hypot(x2 - x1, y2 - y1) >= min(W, H) * 0.18:
                        long_white_lines += 1

        # ----- vertical pole + diagonal-fence-pattern detection -----
        # Light poles, hoop posts, and fence posts all produce tall near-vertical
        # edges. We separately count diagonal lines, which are a much stronger
        # signal for chain-link fencing (stage 7) than poles alone.
        edges = cv2.Canny(gray, 80, 180)
        edge_density = float(edges.sum()) / (255.0 * total)
        plines = cv2.HoughLinesP(
            edges, rho=1, theta=np.pi / 180,
            threshold=40,
            minLineLength=int(H * 0.18),
            maxLineGap=4,
        )
        pole_count_raw = 0
        diagonal_count = 0
        if plines is not None:
            for x1, y1, x2, y2 in plines[:, 0]:
                dx, dy = abs(x2 - x1), abs(y2 - y1)
                if dy >= 4 * max(dx, 1):                # near-vertical
                    pole_count_raw += 1
                elif 0.6 <= dy / max(dx, 1) <= 1.8 and dx > W * 0.10:
                    diagonal_count += 1                  # chain-link / X-pattern
        # Hough returns multiple segments per physical pole — cap to dampen the
        # over-count effect and keep this feature in a sensible range.
        pole_count = min(pole_count_raw, 12)

        # ----- evidence flags -----
        # 3+ long white-line segments is a real-photo-friendly threshold; on
        # synthetic data we see ~7-15 lines, on real photos we typically see 3-6.
        has_court_lines = long_white_lines >= 3
        has_strong_slab = slab > 0.18 or has_slab_blob
        has_asphalt_surface = asphalt > 0.20
        # Stage 7 = perimeter fencing. The defining visual cue is a chain-link
        # X-pattern (many diagonal short-medium lines) — not poles alone, since
        # light poles around an unfenced court would otherwise tip into stage 7.
        has_fence_pattern = diagonal_count >= 6

        # ----- per-stage scores -----
        # Designed so a representative photo for each stage scores highest on its
        # own row, and so impossible-given-evidence stages get strongly penalised.
        scores = np.zeros(NUM_CLASSES, dtype=np.float32)
        scores[0] = soil * 2.0 - slab * 1.5 - asphalt * 0.8 - white * 1.0       # bare ground
        scores[1] = soil * 0.6 + gravel * 1.6 - slab * 0.8 - white * 1.0        # sub-base
        scores[2] = slab * 2.5 - asphalt * 0.5 - long_white_lines * 0.3         # raw slab, no markings
        scores[3] = asphalt * 2.0 + slab * 0.6 - soil * 0.5 - long_white_lines * 0.2  # surface finish
        scores[4] = (white * 2.5 + long_white_lines * 0.5
                     + (slab + asphalt) * 0.6 - soil * 0.6)                      # line marking
        # Stages 6 and 7 (hoops / fencing) are *additive on top of* a finished
        # painted court — they cannot occur on a bare site. Gate their
        # vertical-edge / pole signal on court-line evidence so a sub-base photo
        # with a couple of stake lines doesn't masquerade as fencing.
        if has_court_lines:
            # Hoops require court lines + nontrivial pole evidence near centre.
            # Don't over-weight pole_count — Hough overcounts.
            scores[5] = (metal * 1.6 + pole_count * 0.08
                         + edge_density * 0.5 - soil * 0.3)                      # hoops
            # Fencing requires the X-pattern of chain-link, not just vertical
            # lines (light poles around an unfenced court would otherwise win).
            scores[6] = (diagonal_count * 0.15 + pole_count * 0.05
                         + edge_density * 0.6 - soil * 0.5 - slab * 0.2)         # fencing
        else:
            scores[5] = -2.0  # impossible without a finished court
            scores[6] = -2.0

        # ----- hard evidence overrides -----
        # Once you can see painted court lines, you cannot still be in clearing,
        # sub-base, or even raw-slab — the surface finish is necessarily done.
        if has_court_lines:
            scores[0] -= 6.0
            scores[1] -= 6.0
            scores[2] -= 4.0
        # A large rectangular grey blob is a court/slab — rules out the dirt-
        # only stages even when soil dominates the perimeter.
        if has_slab_blob:
            scores[0] -= 6.0
            scores[1] -= 5.0
            # Without lines yet, reward stage 3 (raw slab); with lines, the
            # court-lines branch above already locks it into stage 4+.
            if not has_court_lines:
                scores[2] += 1.5
            else:
                scores[3] += 0.5
                scores[4] += 0.5
        # A real slab (>18% of the centre region) rules out clearing & sub-base.
        if has_strong_slab or has_asphalt_surface:
            scores[0] -= 5.0
            scores[1] -= 4.0
        # Strong stage-7 boost requires a real chain-link/fence pattern, not
        # merely the presence of many vertical poles (which could be lighting).
        if has_court_lines and has_fence_pattern:
            scores[6] += 1.5

        # Softmax with temperature.
        temperature = 0.7
        z = scores / temperature
        e = np.exp(z - z.max())
        probs = e / e.sum()

        idx = int(np.argmax(probs))
        stage = stage_for_index(idx)

        sorted_idx = np.argsort(probs)[::-1]
        top1, top2 = probs[sorted_idx[0]], probs[sorted_idx[1]]
        margin = float((top1 - top2) / max(top1, 1e-6))

        # Within-band position. For stage 5, place it earlier in the band when
        # only a few lines are detected and later when many are.
        if idx == 4:  # line marking
            position = min(1.0, 0.25 + 0.12 * long_white_lines)
        else:
            position = max(0.0, min(1.0, 0.3 + 0.7 * margin))
        progress = stage.progress_lo + position * (stage.progress_hi - stage.progress_lo)

        confidence = float(0.5 * top1 + 0.5 * margin)

        raw = {f"stage_{i+1}": float(p) for i, p in enumerate(probs)}
        raw["features"] = {
            "soil": round(soil, 3),
            "gravel": round(gravel, 3),
            "slab": round(slab, 3),
            "asphalt": round(asphalt, 3),
            "white": round(white, 3),
            "metal": round(metal, 3),
            "edge_density": round(edge_density, 3),
            "long_white_lines": int(long_white_lines),
            "pole_count": int(pole_count),
            "diagonal_count": int(diagonal_count),
            "biggest_blob_frac": round(biggest_blob_frac, 3),
            "biggest_blob_rectness": round(biggest_blob_rectness, 3),
            "has_court_lines": bool(has_court_lines),
            "has_strong_slab": bool(has_strong_slab),
            "has_slab_blob": bool(has_slab_blob),
            "has_fence_pattern": bool(has_fence_pattern),
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

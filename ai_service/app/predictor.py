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
from .object_detection import detect_court_structures, summarize_detections

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
        """Real-photo-tuned CV heuristic.

        Rewritten after the previous version misclassified real construction
        photos: it confused gravel for concrete slab (both have low saturation)
        and treated concrete-joint edges as "court lines". The current rules
        instead lean on three things real photos give us clearly:

          1. **Surface texture variance** (Laplacian) — gravel reads as high
             texture, smooth concrete reads as low texture. This is what
             separates stage 2 from stage 3 when colour cues fail.
          2. **Painted-surface saturation** — finished basketball courts are
             almost always painted in saturated colours (blue, green, red,
             purple, ochre yellow). Raw concrete is grey, soil is desaturated
             brown. A large saturated central region is the strongest single
             cue that we have passed stage 4.
          3. **Court lines gated on a painted background** — a long white
             segment only counts as a *court marking* if it sits on a painted
             surface. Otherwise it is a concrete joint, a wall edge, or a
             reflection, and we ignore it.

        Hard overrides at the bottom prevent visually-impossible stages from
        winning (e.g. a fully painted court cannot be in 'site clearing').
        """
        import cv2
        bgr = decode_image(image_bytes)
        # Run zero-shot object detection on the ORIGINAL (un-resized) image so
        # small distant backboards aren't shrunk below detection threshold.
        # Detection is best-effort: returns [] if OWLv2 is unavailable, in
        # which case the heuristic still classifies stages 1-5 fine.
        detections = detect_court_structures(bgr)
        det = summarize_detections(detections)
        bgr = cv2.resize(bgr, (self.input_size, self.input_size))
        H, W = bgr.shape[:2]
        total = H * W
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Center weighting: 1.0 at the image centre, falling off to ~0 at corners.
        cy, cx = H / 2.0, W / 2.0
        yy, xx = np.mgrid[0:H, 0:W]
        radial = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        center_w = np.clip(1.4 - radial / np.sqrt(cx ** 2 + cy ** 2), 0.0, 1.0).astype(np.float32)
        center_total = float(center_w.sum())

        def cratio(mask: np.ndarray) -> float:
            return float((mask.astype(np.float32) * center_w).sum()) / center_total

        # ----- colour masks -----
        soil_mask     = ((h >= 5) & (h <= 25) & (s > 40) & (s < 180) & (v > 50) & (v < 200))
        # Gravel = low saturation, mid value. Concrete also fits this colourwise,
        # so we disambiguate with texture variance further down.
        gravel_mask   = ((s < 55) & (v > 70) & (v < 180))
        slab_mask     = ((s < 55) & (v > 80) & (v < 230))
        asphalt_mask  = ((s < 60) & (v > 35) & (v < 95))
        # Court paint: HIGH saturation pixels of *any* hue. Stage 5+ courts
        # are blue/green/red/purple/yellow — this single mask covers them all.
        painted_mask  = ((s > 75) & (v > 70))
        white_mask    = ((s < 40) & (v > 190))
        metal_mask    = ((s < 30) & (v > 220))

        soil     = cratio(soil_mask)
        gravel   = cratio(gravel_mask)
        slab_col = cratio(slab_mask)
        asphalt  = cratio(asphalt_mask)
        painted  = cratio(painted_mask)
        white    = cratio(white_mask)
        metal    = cratio(metal_mask)

        # ----- surface texture (laplacian variance on the centre square) -----
        # Gravel courses are visually noisy — the laplacian fires on every rock
        # edge, giving variance in the hundreds to thousands. Smooth concrete
        # or acrylic court tiles give variance well under 200.
        cy0, cy1 = H // 4, 3 * H // 4
        cx0, cx1 = W // 4, 3 * W // 4
        center_gray = gray[cy0:cy1, cx0:cx1]
        lap_var = float(cv2.Laplacian(center_gray, cv2.CV_64F).var())
        center_sat_mean = float(s[cy0:cy1, cx0:cx1].mean())

        # ----- largest contiguous painted region -----
        # Crucial: a real painted court is ONE big rectangular patch of saturated
        # colour. Scattered saturated pixels (hi-viz vests, plant leaves, signs)
        # form an irregularly-shaped blob with low rectangularity, even after
        # morphological closing. We measure (a) coverage, (b) hue diversity, and
        # (c) rectangularity (area / bbox_area) of that blob.
        painted_mask_u8 = painted_mask.astype(np.uint8)
        painted_mask_u8 = cv2.morphologyEx(painted_mask_u8, cv2.MORPH_CLOSE,
                                            np.ones((7, 7), np.uint8), iterations=2)
        pn, plabels, pstats, _ = cv2.connectedComponentsWithStats(painted_mask_u8, connectivity=8)
        painted_blob_area = 0
        painted_blob_frac = 0.0
        painted_blob_dom_hues = 0
        painted_blob_rectness = 0.0
        if pn > 1:
            pareas = pstats[1:, cv2.CC_STAT_AREA]
            pidx = int(np.argmax(pareas)) + 1
            painted_blob_area = int(pstats[pidx, cv2.CC_STAT_AREA])
            painted_blob_frac = painted_blob_area / float(total)
            pbw = int(pstats[pidx, cv2.CC_STAT_WIDTH])
            pbh = int(pstats[pidx, cv2.CC_STAT_HEIGHT])
            painted_blob_rectness = painted_blob_area / max(1, pbw * pbh)
            if painted_blob_area > 400:
                blob_mask_p = (plabels == pidx)
                blob_h = h[blob_mask_p]
                hue_h, _ = np.histogram(blob_h, bins=18, range=(0, 180))
                peak_thresh_p = max(150, hue_h.max() * 0.30)
                painted_blob_dom_hues = int((hue_h >= peak_thresh_p).sum())

        # Frame-wide dominant-hue count on all saturated pixels (cheaper signal).
        dominant_hues = 0
        if painted_mask.sum() > 400:
            sat_h = h[painted_mask]
            hue_hist, _ = np.histogram(sat_h, bins=18, range=(0, 180))
            peak_thresh = max(250, hue_hist.max() * 0.40)
            dominant_hues = int((hue_hist >= peak_thresh).sum())

        # ----- largest connected court-like region -----
        # The court is one large coherent region — concrete-grey, asphalt-dark,
        # or painted-saturated. Union all three; gravel is deliberately excluded
        # because it's textured noise, not a coherent surface.
        court_like = (slab_mask | asphalt_mask | painted_mask).astype(np.uint8)
        court_like = cv2.morphologyEx(court_like, cv2.MORPH_CLOSE,
                                       np.ones((5, 5), np.uint8), iterations=2)
        n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(court_like, connectivity=8)
        biggest_blob_area = 0
        biggest_blob_rectness = 0.0
        biggest_blob_painted_frac = 0.0
        biggest_blob_lap = 0.0
        if n_labels > 1:
            areas = stats[1:, cv2.CC_STAT_AREA]
            biggest_idx = int(np.argmax(areas)) + 1
            biggest_blob_area = int(stats[biggest_idx, cv2.CC_STAT_AREA])
            x, y, w, hh = (int(stats[biggest_idx, cv2.CC_STAT_LEFT]),
                           int(stats[biggest_idx, cv2.CC_STAT_TOP]),
                           int(stats[biggest_idx, cv2.CC_STAT_WIDTH]),
                           int(stats[biggest_idx, cv2.CC_STAT_HEIGHT]))
            biggest_blob_rectness = biggest_blob_area / max(1, w * hh)
            blob_mask = (labels == biggest_idx)
            # How much of the blob is painted (vs raw grey)?
            biggest_blob_painted_frac = float((blob_mask & painted_mask).sum()) / max(1, biggest_blob_area)
            # Texture variance restricted to the blob — used to distinguish a
            # smooth slab from a noisy gravel area that snuck into the mask.
            if blob_mask.sum() > 200:
                blob_gray = gray.copy()
                blob_gray[~blob_mask] = 0
                # variance over the blob's bounding box only
                bb = blob_gray[y:y+hh, x:x+w]
                biggest_blob_lap = float(cv2.Laplacian(bb, cv2.CV_64F).var())
        biggest_blob_frac = biggest_blob_area / float(total)

        # ----- court line marking detection (gated on painted surface) -----
        # Real court markings sit on a saturated background. Detecting white
        # pixels alone fires on sky, reflections, concrete joints, dust.
        long_white_lines = 0
        white_on_paint = 0
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
                # A line counts as a "court marking" if at least one endpoint —
                # OR the segment midpoint — lies near a painted region. We dilate
                # the painted mask a few pixels so a line that runs *along* a
                # painted area still counts.
                paint_dilated = cv2.dilate(painted_mask.astype(np.uint8),
                                            np.ones((9, 9), np.uint8))
                for x1, y1, x2, y2 in lines[:, 0]:
                    if np.hypot(x2 - x1, y2 - y1) < min(W, H) * 0.18:
                        continue
                    long_white_lines += 1
                    mx, my = (x1 + x2) // 2, (y1 + y2) // 2
                    if 0 <= my < H and 0 <= mx < W and paint_dilated[my, mx]:
                        white_on_paint += 1

        # ----- vertical pole + diagonal-fence-pattern detection -----
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
        upper_vertical_xs: list[int] = []
        if plines is not None:
            for x1, y1, x2, y2 in plines[:, 0]:
                dx, dy = abs(x2 - x1), abs(y2 - y1)
                if dy >= 4 * max(dx, 1):
                    pole_count_raw += 1
                    # Tall vertical lines that reach into the upper half of the
                    # frame are perimeter / hoop / fence poles. Track their x.
                    if min(y1, y2) < H * 0.55:
                        upper_vertical_xs.append((x1 + x2) // 2)
                elif 0.6 <= dy / max(dx, 1) <= 1.8 and dx > W * 0.10:
                    diagonal_count += 1
        pole_count = min(pole_count_raw, 12)

        # Spaced vertical-pole array: 2+ distinct poles spread across the frame
        # is hard to fake with a single tree trunk or shadow. Used as Stage 6/7
        # evidence even on a bare-concrete court.
        pole_array_count = 0
        if upper_vertical_xs:
            xs = sorted(upper_vertical_xs)
            kept = [xs[0]]
            for x in xs[1:]:
                if x - kept[-1] > W * 0.10:  # ≥10% of frame apart
                    kept.append(x)
            pole_array_count = len(kept)

        # ----- backboard detection -----
        # A basketball backboard is a bright (high-V, low-S) rectangle whose
        # CENTRE is in the upper ~40% of the frame, with a tall vertical pole
        # supporting it from below. Without the supporting-pole check this
        # detector over-fires on workers' shirts, sky patches and white bags.
        # Conservative version: only count close-up backboards (>4% of frame).
        # Distant backboards are too easy to confuse with cloud patches / white
        # equipment, and the false positives hurt more than the small wins
        # would help. The trade-off here favours precision over recall.
        bb_mask = ((s < 50) & (v > 195)).astype(np.uint8)
        bb_mask = cv2.morphologyEx(bb_mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        bbn, _, bbstats, _ = cv2.connectedComponentsWithStats(bb_mask, connectivity=8)
        backboard_count = 0
        for i in range(1, bbn):
            area = int(bbstats[i, cv2.CC_STAT_AREA])
            # Only big, close-up backboards qualify. The 4% lower bound is
            # what cuts out cloud patches and white shirts/equipment.
            if area < total * 0.04 or area > total * 0.40:
                continue
            by = int(bbstats[i, cv2.CC_STAT_TOP])
            bw = int(bbstats[i, cv2.CC_STAT_WIDTH])
            bh = int(bbstats[i, cv2.CC_STAT_HEIGHT])
            # Centre in the upper 45% of the frame.
            if by + bh / 2.0 > H * 0.45:
                continue
            # Landscape aspect (slightly wider than tall).
            if bw < bh * 1.0 or bw > bh * 2.5:
                continue
            # Solid rectangle.
            if area / max(1, bw * bh) < 0.65:
                continue
            backboard_count += 1

        # ----- derived evidence flags -----
        # Gravel: very high local texture + cool/desaturated rocks. Three clauses:
        #   (a) classic gravel-dominant photos,
        #   (b) gravel+workers scenes where hi-viz pushes mean saturation up but
        #       the surface texture is still rocky,
        #   (c) very-rough warm-earth scenes (soil + scattered rocks) where the
        #       gravel HSV mask is too tight to catch warm-lit rocks but the
        #       texture energy is unmistakeably non-slab.
        has_gravel_surface = (
            (lap_var > 9000 and center_sat_mean < 60 and gravel > 0.30)
            or (lap_var > 8000 and gravel > 0.18 and (soil + gravel) > 0.25)
            or (lap_var > 9500 and (soil + gravel) > 0.25)
        )

        # Painted court: a LARGE, RECTANGULAR, HIGHLY-SATURATED, *SMOOTH* region.
        # Scattered hi-viz vests / orange sand form a big saturated blob too —
        # but they're either irregular (low rectangularity) OR textured (workers
        # + wet concrete have high Laplacian variance, finished paint is flat).
        # Golden-hour wet concrete looks "painted" by colour alone, so the
        # texture check is what stops it being misclassified.
        # A real multi-coloured painted court has high grayscale variance from
        # the colour boundaries themselves — treat that as "smooth enough".
        # Threshold tuned against real data: aq.jpeg (real partial paint) is
        # ~5400, wet-concrete-in-golden-hour is ~7000, so the gate sits between.
        smooth_enough = (biggest_blob_lap < 6500) or (painted_blob_dom_hues >= 3)
        has_painted_court = (
            (painted_blob_frac > 0.20 and center_sat_mean > 50
              and painted_blob_rectness > 0.45 and smooth_enough)
            or (painted_blob_frac > 0.10 and painted_blob_dom_hues >= 3
                 and center_sat_mean > 50 and painted_blob_rectness > 0.40
                 and smooth_enough)
        ) and not has_gravel_surface

        # Court lines: 3+ long white segments AND on a painted background.
        has_court_lines = white_on_paint >= 3 and has_painted_court
        # Concrete slab: large rectangular blob with *low* texture variance.
        # The texture cap (lap_var < 8000) is what stops gravel-on-sub-base
        # scenes from masquerading as slab — concrete is smooth, gravel is not.
        # Saturation cap relaxed to 100 so golden-hour orange-tinted concrete
        # still qualifies.
        has_concrete_slab = (biggest_blob_frac > 0.30 and biggest_blob_rectness > 0.35 and
                              center_sat_mean < 100 and lap_var < 8000 and
                              not has_painted_court and not has_gravel_surface)
        # Asphalt finish: large dark surface, no paint, no gravel.
        has_asphalt_surface = asphalt > 0.25 and not has_painted_court and not has_gravel_surface
        # Soil dominant: warm earthy hue covering the centre, no rectangle, no
        # large slab-like blob. A sunset-lit concrete court reads as warm earthy
        # too — so we require BOTH a high soil ratio AND the absence of a big
        # rectangular blob before flagging this as bare ground.
        has_soil_dominant = (soil > 0.40 and biggest_blob_frac < 0.30
                              and not has_concrete_slab and not has_painted_court
                              and not has_gravel_surface)
        # ----- object-detection-driven flags -----
        # OWLv2 zero-shot detector. Backboards and chain-link fences are highly
        # specific — when OWLv2 finds them, we trust them. The "basketball pole"
        # prompt is too generic (it fires on workers, sticks, light poles in
        # background), so we only use pole counts as a *bonus*, never as the
        # primary signal.
        det_backboard = det["backboard_count"] >= 1
        det_fence     = det["fence_count"] >= 1

        # Strong fence: detector says so, OR the legacy painted-court diagonals.
        has_strong_fence = det_fence
        has_fence_pattern = (
            det_fence
            or (diagonal_count >= 10 and has_painted_court and has_court_lines)
        )
        # Hoops: backboard detection OR the legacy painted+metal combo. We do
        # NOT use OWLv2 pole alone — it false-positives on workers and stakes.
        has_backboard = det_backboard
        has_pole_array = pole_array_count >= 3
        has_hoop_signal = (
            det_backboard
            or (has_painted_court and has_court_lines and (metal > 0.04 or pole_count >= 2))
        )

        # ----- per-stage scores -----
        # IMPORTANT: only penalize stages 1-3 by the *confirmed* painted signal.
        # The raw `painted` ratio fires high on hi-viz vests + warm sandy ground;
        # if `has_painted_court` is False we already know that's noise, so we
        # must not let the noise penalty hand a default win to Stage 4.
        real_paint = painted if has_painted_court else 0.0
        # Texture energy normalised to roughly [0, 1] — high on gravel and wet
        # concrete, near zero on smooth painted/concrete surfaces.
        texture_signal = max(0.0, min((lap_var - 4000.0) / 8000.0, 1.0))

        scores = np.zeros(NUM_CLASSES, dtype=np.float32)

        # Stage 1: bare ground. Soil rules; no painted area, no slab.
        scores[0] = (soil * 2.0 - real_paint * 4.0 - biggest_blob_frac * 1.5
                     - white * 0.5 - asphalt * 1.0)
        if has_soil_dominant:
            scores[0] += 1.5

        # Stage 2: gravel sub-base. Strong on gravel colour + texture; no need
        # for a painted-court vote here, the gravel surface signal speaks for it.
        scores[1] = (gravel * 1.5 + texture_signal * 1.5
                     - real_paint * 4.0 - white * 1.0)
        if has_gravel_surface:
            scores[1] += 2.5

        # Stage 3: raw concrete slab — large smooth grey blob, no paint, no lines.
        scores[2] = (slab_col * 1.5 - real_paint * 3.0 - long_white_lines * 0.15
                     - texture_signal * 1.2)  # very rough surface != smooth slab
        if has_concrete_slab and not has_painted_court and not has_court_lines:
            scores[2] += 2.5

        # Stage 4: surface finishing — asphalt OR painted court without markings.
        # Crucially, Stage 4 should NOT be the default winner just because the
        # other stages are penalised. Start it at a low base.
        scores[3] = -1.0
        if has_painted_court and not has_court_lines:
            scores[3] = 2.2
        elif has_asphalt_surface:
            scores[3] = 2.0

        # Stage 5: line marking. Needs painted court + multiple white segments on it.
        if has_painted_court and has_court_lines:
            scores[4] = 2.0 + min(white_on_paint, 10) * 0.18 + painted * 1.0
        else:
            scores[4] = -2.0

        # Stage 6: hoops. A detector backboard hit is the strongest evidence —
        # weight it high enough to beat painted-court-without-hoops (Stage 5).
        if has_hoop_signal:
            scores[5] = (1.8
                         + (det["backboard_count"] * 1.0)
                         + (det["pole_count"] * 0.4)
                         + (det["backboard_score"] * 1.5)
                         + metal * 1.0
                         + min(pole_count, 6) * 0.10)
        else:
            scores[5] = -3.0

        # Stage 7: fencing. A detector fence hit dominates — chain-link being
        # installed is the final visible activity in real-world construction.
        if has_fence_pattern:
            scores[6] = (1.6
                         + (det["fence_count"] * 0.8)
                         + (det["fence_score"] * 1.5)
                         + min(diagonal_count, 30) * 0.03)
            # If we ALSO see a backboard, the project is in late Stage 7
            # (court complete, perimeter going in).
            if det_backboard:
                scores[6] += 0.4
        else:
            scores[6] = -3.0

        # ----- hard evidence overrides -----
        # A painted surface eliminates everything below stage 4.
        if has_painted_court:
            scores[0] -= 8.0
            scores[1] -= 8.0
            scores[2] -= 5.0
        # Court line markings (on paint) eliminate stages 1-3 and bias above stage 3.
        if has_court_lines:
            scores[0] -= 8.0
            scores[1] -= 8.0
            scores[2] -= 6.0
            scores[3] -= 1.0
        # Visible concrete slab eliminates stages 1 and 2.
        if has_concrete_slab:
            scores[0] -= 6.0
            scores[1] -= 5.0
        # High-texture gravel eliminates "finished" stages — sub-base cannot have
        # poured slab or court paint by definition.
        if has_gravel_surface:
            scores[2] -= 3.0
            scores[3] -= 4.0
            scores[4] -= 6.0
            scores[5] -= 6.0
            scores[6] -= 6.0

        # ----- soft-max with temperature -----
        temperature = 0.6
        z = scores / temperature
        e = np.exp(z - z.max())
        probs = e / e.sum()

        idx = int(np.argmax(probs))
        stage = stage_for_index(idx)

        sorted_idx = np.argsort(probs)[::-1]
        top1, top2 = probs[sorted_idx[0]], probs[sorted_idx[1]]
        margin = float((top1 - top2) / max(top1, 1e-6))

        # Within-band position
        if idx == 4:  # line marking: more lines = later in band
            position = min(1.0, 0.25 + 0.10 * white_on_paint)
        elif idx == 1:  # gravel: more gravel coverage = later in band
            position = min(1.0, 0.30 + 1.2 * gravel)
        elif idx == 2:  # raw slab: bigger blob = later in band
            position = min(1.0, 0.30 + 0.8 * biggest_blob_frac)
        else:
            position = max(0.0, min(1.0, 0.3 + 0.7 * margin))
        progress = stage.progress_lo + position * (stage.progress_hi - stage.progress_lo)

        confidence = float(0.5 * top1 + 0.5 * margin)

        raw = {f"stage_{i+1}": float(p) for i, p in enumerate(probs)}
        raw["features"] = {
            "soil": round(soil, 3),
            "gravel": round(gravel, 3),
            "slab": round(slab_col, 3),
            "asphalt": round(asphalt, 3),
            "painted": round(painted, 3),
            "white": round(white, 3),
            "metal": round(metal, 3),
            "edge_density": round(edge_density, 3),
            "lap_var": round(lap_var, 1),
            "center_sat_mean": round(center_sat_mean, 1),
            "dominant_hues": int(dominant_hues),
            "painted_blob_frac": round(painted_blob_frac, 3),
            "painted_blob_dom_hues": int(painted_blob_dom_hues),
            "painted_blob_rectness": round(painted_blob_rectness, 3),
            "long_white_lines": int(long_white_lines),
            "white_on_paint": int(white_on_paint),
            "pole_count": int(pole_count),
            "pole_array_count": int(pole_array_count),
            "backboard_count": int(backboard_count),
            "diagonal_count": int(diagonal_count),
            "biggest_blob_frac": round(biggest_blob_frac, 3),
            "biggest_blob_rectness": round(biggest_blob_rectness, 3),
            "biggest_blob_painted_frac": round(biggest_blob_painted_frac, 3),
            "biggest_blob_lap": round(biggest_blob_lap, 1),
            "has_court_lines": bool(has_court_lines),
            "has_painted_court": bool(has_painted_court),
            "has_gravel_surface": bool(has_gravel_surface),
            "has_concrete_slab": bool(has_concrete_slab),
            "has_asphalt_surface": bool(has_asphalt_surface),
            "has_soil_dominant": bool(has_soil_dominant),
            "has_fence_pattern": bool(has_fence_pattern),
            "has_strong_fence": bool(has_strong_fence),
            "has_hoop_signal": bool(has_hoop_signal),
            "has_backboard": bool(has_backboard),
            "has_pole_array": bool(has_pole_array),
            "owlv2": det,
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

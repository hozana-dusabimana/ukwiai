"""Zero-shot object detection for basketball-court stage classification.

Uses OWLv2 (Google) to find backboards, chain-link fencing, and basketball
poles in site photos. The detector is *zero-shot* — it takes natural-language
prompts and finds matching objects without any task-specific training. This
is what lets the heuristic finally reach Stages 6 and 7 reliably: pixel-only
rules can't tell a backboard from a worker's shirt, but OWLv2 can.

The model is lazy-loaded on first use (the import alone costs ~1 s, and the
weights download is ~600 MB on first call). If torch / transformers aren't
installed, `detect_court_structures` returns an empty result and the heuristic
falls back to its prior behaviour — the service stays functional without ML.
"""
from __future__ import annotations
import logging
import os
import threading
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("ai-objdet")
_LOCK = threading.Lock()
_PIPELINE: Any | None = None
_PIPELINE_LOAD_ATTEMPTED = False

# Text prompts. Wording matters for zero-shot — short concrete nouns work best.
# The first three drive Stage 6/7 scoring (see predictor); the rest are broad
# "is this a court/construction scene at all" prompts used only by the relevance
# gate, so an early-stage site (bare ground, gravel, slab) with no hoop yet can
# still register as a genuine basketball-court photo.
_PROMPTS = [
    "basketball backboard",
    "chain-link fence",
    "basketball pole",
    "basketball hoop",
    "basketball court",
    "outdoor sports court",
    "concrete pavement",
    "construction site",
    # Competing-sport structures — used ONLY to tell a basketball court apart
    # from another sport's court (this system monitors basketball). None of these
    # exist on a basketball court, so detecting one while seeing NO backboard is
    # what flags "wrong sport". See predictor for how they gate relevance.
    "volleyball net",
    "volleyball net post",
    "tennis court",
    "football goal post",
]
# Labels the stage-scoring rules read by name — kept stable as prompts grow.
_STAGE_LABELS = ("basketball backboard", "chain-link fence", "basketball pole")
# Threshold tuned for precision on real construction photos. OWLv2 returns
# many low-confidence boxes; 0.20 is a reasonable balance.
_SCORE_THRESHOLD = float(os.environ.get("AI_OBJDET_THRESHOLD", "0.20"))
# Wrong-sport prompts run at a LOWER threshold: here we want high recall (catch
# the competing sport even on a faint detection) because a miss means a
# volleyball/tennis court gets analysed as basketball, which is the failure mode
# we're hardening against. False positives cost only a re-shoot.
_WRONG_SPORT_THRESHOLD = float(os.environ.get("AI_WRONGSPORT_THRESHOLD", "0.14"))
_WRONG_SPORT_LABELS = frozenset({
    "volleyball net", "volleyball net post", "tennis court", "football goal post",
})


def _threshold_for(label: str) -> float:
    return _WRONG_SPORT_THRESHOLD if label in _WRONG_SPORT_LABELS else _SCORE_THRESHOLD


@dataclass(frozen=True)
class Detection:
    label: str
    score: float
    box: tuple[float, float, float, float]  # (x1, y1, x2, y2), in image pixels


def _load_pipeline() -> Any | None:
    """Lazy-load the OWLv2 detector. Returns None on any failure so the
    caller can fall back to the heuristic-only path."""
    global _PIPELINE, _PIPELINE_LOAD_ATTEMPTED
    if _PIPELINE is not None or _PIPELINE_LOAD_ATTEMPTED:
        return _PIPELINE
    with _LOCK:
        if _PIPELINE is not None or _PIPELINE_LOAD_ATTEMPTED:
            return _PIPELINE
        _PIPELINE_LOAD_ATTEMPTED = True
        # AI_DISABLE_OBJDET=1 skips loading torch/OWLv2 entirely. On small
        # (RAM-constrained) hosts the ~600 MB model + torch runtime can exhaust
        # memory and disrupt co-tenants, so production runs heuristic-only by
        # default. Flip this off on a larger instance to re-enable detection.
        if os.environ.get("AI_DISABLE_OBJDET", "").strip().lower() in ("1", "true", "yes"):
            logger.info("AI_DISABLE_OBJDET set — skipping OWLv2, heuristic-only.")
            _PIPELINE = None
            return _PIPELINE
        try:
            # Local imports keep the FastAPI cold-start fast when detection
            # is disabled or torch is missing.
            from transformers import Owlv2Processor, Owlv2ForObjectDetection
            import torch
            model_id = os.environ.get(
                "AI_OBJDET_MODEL", "google/owlv2-base-patch16-ensemble"
            )
            logger.info("Loading OWLv2 model %s ...", model_id)
            processor = Owlv2Processor.from_pretrained(model_id)
            model = Owlv2ForObjectDetection.from_pretrained(model_id)
            model.eval()
            _PIPELINE = (processor, model, torch)
            logger.info("OWLv2 ready.")
        except Exception as exc:
            logger.warning("OWLv2 unavailable — falling back to heuristic only. (%s)", exc)
            _PIPELINE = None
        return _PIPELINE


def objdet_active() -> bool:
    """True only when the OWLv2 pipeline has actually loaded. The relevance gate
    uses this to decide whether it can trust "no detection" as a real signal
    (model present, saw nothing) versus a disabled detector (saw nothing because
    it never ran). A load attempt must have happened first (e.g. via
    detect_court_structures) for this to be meaningful."""
    return _PIPELINE is not None


def detect_court_structures(
    image_bgr,
    *,
    score_threshold: float | None = None,
) -> list[Detection]:
    """Run zero-shot detection on a BGR image array. Returns a flat list of
    Detection objects. Empty list on any failure (model missing, etc.).

    The image is expected as the OpenCV-decoded numpy array (BGR uint8) that
    the predictor already has at hand — no extra decode required.
    """
    pipeline = _load_pipeline()
    if pipeline is None:
        return []
    processor, model, torch = pipeline
    # Post-process at the LOWEST threshold any prompt uses, then filter each
    # detection by its own per-prompt threshold (wrong-sport prompts are kept at
    # a lower bar for recall). An explicit score_threshold overrides both.
    floor = (score_threshold if score_threshold is not None
             else min(_SCORE_THRESHOLD, _WRONG_SPORT_THRESHOLD))

    try:
        import cv2
        import numpy as np
        # OWLv2 wants PIL RGB. Convert in-place.
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        from PIL import Image
        pil = Image.fromarray(rgb)
        inputs = processor(text=[_PROMPTS], images=pil, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        target_sizes = torch.tensor([pil.size[::-1]])  # (H, W)
        results = processor.post_process_object_detection(
            outputs=outputs,
            threshold=floor,
            target_sizes=target_sizes,
        )[0]
        per_prompt = score_threshold is None  # honour per-prompt bars unless overridden
        out: list[Detection] = []
        for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
            prompt = _PROMPTS[int(label)]
            if per_prompt and float(score) < _threshold_for(prompt):
                continue
            out.append(Detection(
                label=prompt,
                score=float(score),
                box=tuple(float(v) for v in box.tolist()),
            ))
        return out
    except Exception as exc:
        logger.warning("OWLv2 inference failed (%s)", exc)
        return []


def summarize_detections(detections: list[Detection]) -> dict[str, Any]:
    """Compact roll-up keyed on the labels we care about. Useful both as
    debug output in `raw_predictions.features` and as a stable shape for the
    predictor's stage-scoring rules."""
    counts: dict[str, int] = {p: 0 for p in _PROMPTS}
    best_score: dict[str, float] = {p: 0.0 for p in _PROMPTS}
    for d in detections:
        counts[d.label] = counts.get(d.label, 0) + 1
        best_score[d.label] = max(best_score.get(d.label, 0.0), d.score)
    return {
        "backboard_count": counts.get("basketball backboard", 0),
        "fence_count": counts.get("chain-link fence", 0),
        "pole_count": counts.get("basketball pole", 0),
        "backboard_score": round(best_score.get("basketball backboard", 0.0), 3),
        "fence_score": round(best_score.get("chain-link fence", 0.0), 3),
        "pole_score": round(best_score.get("basketball pole", 0.0), 3),
        # Competing-sport structures (for the wrong-sport guard, not stage scoring).
        "volleyball_net_count": counts.get("volleyball net", 0),
        "volleyball_post_count": counts.get("volleyball net post", 0),
        "volleyball_score": round(max(
            best_score.get("volleyball net", 0.0),
            best_score.get("volleyball net post", 0.0),
        ), 3),
        "tennis_count": counts.get("tennis court", 0),
        "football_goal_count": counts.get("football goal post", 0),
        # Any non-basketball sport structure seen at all.
        "competing_sport_count": (
            counts.get("volleyball net", 0) + counts.get("volleyball net post", 0)
            + counts.get("tennis court", 0) + counts.get("football goal post", 0)
        ),
        # Any detection across our basketball/court/construction prompts is
        # positive evidence that the photo really is a court scene.
        "court_scene_count": len(detections),
        "objdet_active": objdet_active(),
        "total_detections": len(detections),
    }

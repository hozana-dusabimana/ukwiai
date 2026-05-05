"""Manual verification: run the trained CNN against the held-out test split
and the seven canonical synthetic scenarios; print accuracy + per-scenario
predictions so a human can sanity-check the model.

Run inside the ai_service container:
    docker exec ukwi_ai_service python -m tests._verify_trained_model
"""
from __future__ import annotations
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, "/app")
from app.predictor import Predictor
from app.stages import STAGES, NUM_CLASSES
from app.training.synthesize import RENDERERS  # type: ignore


def main():
    model_path = "/app/models/basketball_court_cnn.h5"
    p = Predictor(model_path, "trained-1.0", input_size=224)
    # Trigger lazy load
    dummy = np.full((224, 224, 3), 128, dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(dummy).save(buf, format="PNG")
    p.predict(buf.getvalue())
    print(f"using_fallback={p._using_fallback}  model_loaded={p._model is not None}")
    if p._using_fallback:
        print("WARNING: trained model not loaded; cannot verify.")
        return

    # 1) Per-scenario synthetic predictions
    print("\n=== Per-stage canonical scenario predictions ===")
    for stage_order in range(1, 8):
        # Render a fresh synthetic image
        img = RENDERERS[stage_order]()
        # cv2 writes BGR; convert to RGB then to PNG bytes
        import cv2
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="PNG")
        out = p.predict(buf.getvalue())
        ok = "OK" if out["predicted_stage_order"] == stage_order else "MISS"
        print(f"  [{ok}] expected stage={stage_order}  got stage={out['predicted_stage_order']} "
              f"({out['predicted_stage']})  progress={out['predicted_progress']:.1f}%  "
              f"confidence={out['confidence']:.3f} ({out['confidence_label']})")

    # 2) Test-split accuracy
    print("\n=== Test-split accuracy ===")
    data_root = Path("/app/data/test")
    if not data_root.exists():
        print(f"No test split at {data_root}")
        return
    correct = 0
    total = 0
    per_class_correct = {i: 0 for i in range(1, 8)}
    per_class_total = {i: 0 for i in range(1, 8)}
    for stage_idx in range(1, 8):
        d = data_root / f"stage_{stage_idx}"
        if not d.exists():
            continue
        for img_path in sorted(d.glob("*")):
            if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            data = img_path.read_bytes()
            out = p.predict(data)
            total += 1
            per_class_total[stage_idx] += 1
            if out["predicted_stage_order"] == stage_idx:
                correct += 1
                per_class_correct[stage_idx] += 1
    overall = correct / max(1, total)
    print(f"Overall accuracy: {correct}/{total} = {overall:.1%}")
    for i in range(1, 8):
        if per_class_total[i] == 0:
            continue
        per = per_class_correct[i] / per_class_total[i]
        print(f"  stage {i}: {per_class_correct[i]}/{per_class_total[i]} = {per:.1%}")


if __name__ == "__main__":
    main()

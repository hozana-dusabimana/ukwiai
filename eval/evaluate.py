"""Evaluate the UKWI relevance gate + volleyball discrimination on real images.

Mirrors the two backend guards in `backend/app/api/v1/ai.py`:
  * Guard 1  — reject when predict() returns is_basketball_court == False.
  * Guard 1b — reject when predict() returns structure_sport == "volleyball".
A photo is ALLOWED only if it passes BOTH. (The measurement-based volleyball
flag is NOT exercised here — it needs the project's declared court dimensions,
not a raw image — so this measures purely the image-driven gate.)

Run once per mode (separate processes, because OWLv2 caches its pipeline):
    AI_DISABLE_OBJDET=1 python evaluate.py data heuristic
    AI_DISABLE_OBJDET=0 python evaluate.py data owlv2

Per-class expectation:
    basketball     -> ALLOW  (true positive)
    volleyball     -> BLOCK
    non_court      -> BLOCK
    other_grounds  -> BLOCK
"""
import csv
import os
import sys
import time

# Make the ai_service package importable.
AI_SERVICE = r"f:/projects/final year projects/ukwiai/ai_service"
sys.path.insert(0, AI_SERVICE)

from app.predictor import Predictor  # noqa: E402

EXPECT_ALLOW = {"basketball": True, "volleyball": False,
                "non_court": False, "other_grounds": False}
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


def iter_images(folder: str):
    for name in sorted(os.listdir(folder)):
        if os.path.splitext(name)[1].lower() in IMG_EXTS:
            yield os.path.join(folder, name)


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else "data"
    mode = sys.argv[2] if len(sys.argv) > 2 else "heuristic"
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 0  # 0 = all

    # No .h5 in the repo -> heuristic path, which is the one that carries the
    # relevance gate + structure_sport. (The trained-CNN path trusts its own
    # classification and would need separate evaluation.)
    predictor = Predictor(os.path.join(AI_SERVICE, "models", "missing.h5"),
                          "eval-1.0", input_size=224)

    rows = []
    per_class = {}
    classes = [c for c in EXPECT_ALLOW if os.path.isdir(os.path.join(root, c))]
    for cls in classes:
        folder = os.path.join(root, cls)
        imgs = list(iter_images(folder))
        if limit:
            imgs = imgs[:limit]
        allowed = blocked_relevance = blocked_volleyball = errors = 0
        t0 = time.perf_counter()
        for i, path in enumerate(imgs, 1):
            try:
                with open(path, "rb") as f:
                    data = f.read()
                out = predictor.predict(data)
            except Exception as exc:  # corrupt / unreadable image
                errors += 1
                rows.append([cls, os.path.basename(path), "ERROR", "", "", str(exc)[:60]])
                continue
            is_bb = bool(out.get("is_basketball_court"))
            sport = out.get("structure_sport", "unknown")
            is_allowed = is_bb and sport != "volleyball"
            if is_allowed:
                allowed += 1
            elif not is_bb:
                blocked_relevance += 1
            else:  # blocked specifically by the volleyball structure guard
                blocked_volleyball += 1
            rows.append([cls, os.path.basename(path), "ALLOW" if is_allowed else "BLOCK",
                         is_bb, sport, out.get("predicted_stage", "")])
            if i % 50 == 0:
                print(f"  [{mode}] {cls}: {i}/{len(imgs)}", flush=True)
        dt = time.perf_counter() - t0
        n = len(imgs)
        per_class[cls] = {
            "n": n, "allowed": allowed,
            "blocked_relevance": blocked_relevance,
            "blocked_volleyball": blocked_volleyball,
            "errors": errors,
            "block_rate": (n - allowed - errors) / max(1, n - errors),
            "allow_rate": allowed / max(1, n - errors),
            "secs": round(dt, 1),
        }

    # ---- report ----
    print("\n" + "=" * 72)
    print(f"  RELEVANCE-GATE EVALUATION  —  mode = {mode.upper()}")
    print("=" * 72)
    correct = total = 0
    for cls in classes:
        s = per_class[cls]
        want_allow = EXPECT_ALLOW[cls]
        # Correct = allowed when we want allow, blocked when we want block.
        cls_correct = s["allowed"] if want_allow else (s["n"] - s["allowed"] - s["errors"])
        cls_total = s["n"] - s["errors"]
        correct += cls_correct
        total += cls_total
        verdict = "ALLOW" if want_allow else "BLOCK"
        print(f"\n  {cls:<14} (n={s['n']}, want {verdict}, {s['secs']}s, {s['errors']} bad imgs)")
        print(f"     allowed={s['allowed']}  blocked_by_relevance={s['blocked_relevance']}  "
              f"blocked_by_volleyball={s['blocked_volleyball']}")
        rate = s["allow_rate"] if want_allow else s["block_rate"]
        print(f"     => correct {verdict} rate: {rate:.1%}  ({cls_correct}/{cls_total})")

    print("\n" + "-" * 72)
    print(f"  OVERALL correct decisions: {correct}/{total} = {correct / max(1, total):.1%}")
    print("-" * 72)

    out_csv = f"results_{mode}.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["class", "file", "decision", "is_basketball_court", "structure_sport", "predicted_stage"])
        w.writerows(rows)
    print(f"  per-image results -> {out_csv}\n")


if __name__ == "__main__":
    main()

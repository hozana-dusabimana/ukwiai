"""Real-photo STAGE-classification accuracy against the live AI service.

This measures a different thing from evaluate_live.py: not "is it a basketball
court?" (the relevance/sport gate) but "which of the 7 construction stages is
this?" — the model's stage-classification accuracy on REAL photos. It is the
figure needed to replace the synthetic 100% with a real-world number.

Setup — drop real basketball-court photos, sorted by their TRUE stage, into:
    eval/real_test/stage_1/   site clearing / bare ground
    eval/real_test/stage_2/   gravel sub-base
    eval/real_test/stage_3/   concrete slab
    eval/real_test/stage_4/   surface finishing (asphalt / acrylic)
    eval/real_test/stage_5/   court line marking & painting
    eval/real_test/stage_6/   hoops & backboards
    eval/real_test/stage_7/   fencing & final works

Run:   python evaluate_stages.py real_test [workers]

Reports: overall stage accuracy, within-±1-stage accuracy, a 7x7 confusion
matrix, and per-stage precision/recall. MEASUREMENT ONLY — it sends images to
the existing endpoint and scores the responses; it changes nothing in the
running system.
"""
import collections
import csv
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

API = os.environ.get("AI_URL", "https://ai-ukwiai.isiri.rw/predict")
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
N_STAGES = 7


def predict_stage(path: str):
    """Return the predicted stage order (1..7) from the live server, or a marker."""
    for attempt in range(3):
        try:
            with open(path, "rb") as f:
                r = requests.post(API, files={"file": (os.path.basename(path), f, "image/jpeg")},
                                  timeout=60)
            if r.status_code == 200:
                return int(r.json().get("predicted_stage_order", 0))
            if r.status_code in (400, 422):
                return "REJECTED"   # gate rejected it (not scored as a stage)
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else "real_test"
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 2

    tasks = []  # (true_stage, path)
    for stage in range(1, N_STAGES + 1):
        folder = os.path.join(root, f"stage_{stage}")
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if os.path.splitext(name)[1].lower() in IMG_EXTS:
                tasks.append((stage, os.path.join(folder, name)))

    if not tasks:
        print(f"No images found under {root}/stage_1..stage_{N_STAGES}/.")
        print("Add real photos sorted by their true stage, then re-run.")
        return

    rows = []
    conf = collections.Counter()      # (true, pred) -> count
    per_true = collections.Counter()  # true -> scored count
    per_pred = collections.Counter()  # pred -> count
    correct = within1 = scored = rejected = errors = 0

    print(f"Scoring {len(tasks)} real photos against {API} ({workers} workers)...")
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(predict_stage, p): (t, p) for t, p in tasks}
        done = 0
        for fut in as_completed(futs):
            true, p = futs[fut]
            pred = fut.result()
            done += 1
            if pred is None:
                errors += 1
                rows.append([true, os.path.basename(p), "NETERR"])
            elif pred == "REJECTED":
                rejected += 1
                rows.append([true, os.path.basename(p), "REJECTED"])
            else:
                scored += 1
                per_true[true] += 1
                per_pred[pred] += 1
                conf[(true, pred)] += 1
                if pred == true:
                    correct += 1
                if abs(pred - true) <= 1:
                    within1 += 1
                rows.append([true, os.path.basename(p), pred])
            if done % 20 == 0:
                print(f"  {done}/{len(tasks)}", flush=True)

    # ---- report ----
    print("\n" + "=" * 68)
    print("  REAL-PHOTO STAGE-CLASSIFICATION ACCURACY")
    print("=" * 68)
    print(f"  scored={scored}  rejected_by_gate={rejected}  net_errors={errors}")
    if scored:
        print(f"  Exact stage accuracy : {correct}/{scored} = {100*correct/scored:.1f}%")
        print(f"  Within +/-1 stage    : {within1}/{scored} = {100*within1/scored:.1f}%")

        # confusion matrix (rows = true, cols = predicted)
        print("\n  Confusion matrix (rows=true stage, cols=predicted):")
        header = "  true\\pred " + "".join(f"{c:4}" for c in range(1, N_STAGES + 1)) + "   tot"
        print(header)
        for t in range(1, N_STAGES + 1):
            cells = "".join(f"{conf.get((t,c),0):4}" for c in range(1, N_STAGES + 1))
            print(f"     s{t}     {cells}   {per_true.get(t,0):3}")

        # per-stage precision / recall
        print("\n  Per-stage precision / recall:")
        for s in range(1, N_STAGES + 1):
            tp = conf.get((s, s), 0)
            prec = tp / per_pred[s] if per_pred.get(s) else 0.0
            rec = tp / per_true[s] if per_true.get(s) else 0.0
            if per_true.get(s):
                print(f"     stage {s}: precision {prec:5.1%}  recall {rec:5.1%}  (n={per_true[s]})")

    with open("results_stages.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["true_stage", "file", "predicted_stage"])
        w.writerows(rows)
    print("\n  per-image results -> results_stages.csv\n")


if __name__ == "__main__":
    main()

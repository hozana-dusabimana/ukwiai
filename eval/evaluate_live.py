"""Evaluate the LIVE deployed AI service — inference runs on the server.

POSTs each local image to the production AI endpoint and applies the same two
guards the backend uses to decide allow/block:
    ALLOWED  iff  is_basketball_court == True  AND  structure_sport != "volleyball"

Nothing is run locally except reading the image files and the HTTP calls.

Usage: python evaluate_live.py <data_root> [per_class_cap] [workers]
"""
import csv
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

API = os.environ.get("AI_URL", "https://ai-ukwiai.isiri.rw/predict")
EXPECT_ALLOW = {"basketball": True, "volleyball": False,
                "non_court": False, "other_grounds": False}
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


def classify_one(path: str):
    """Return (is_basketball_court, structure_sport) from the live server, or None."""
    for attempt in range(3):
        try:
            with open(path, "rb") as f:
                r = requests.post(API, files={"file": (os.path.basename(path), f, "image/jpeg")},
                                  timeout=40)
            if r.status_code == 200:
                d = r.json()
                return bool(d.get("is_basketball_court")), d.get("structure_sport", "unknown")
            # 400 = server couldn't decode the image (corrupt download) -> skip.
            if r.status_code == 400:
                return "BADIMG"
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else "data"
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 0          # 0 = all
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 3      # gentle on prod

    classes = [c for c in EXPECT_ALLOW if os.path.isdir(os.path.join(root, c))]
    rows, per_class = [], {}

    for cls in classes:
        folder = os.path.join(root, cls)
        imgs = [os.path.join(folder, n) for n in sorted(os.listdir(folder))
                if os.path.splitext(n)[1].lower() in IMG_EXTS]
        if cap:
            imgs = imgs[:cap]
        allowed = blk_relevance = blk_volleyball = bad = errors = 0
        done = 0
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(classify_one, p): p for p in imgs}
            for fut in as_completed(futs):
                p = futs[fut]
                res = fut.result()
                done += 1
                if res is None:
                    errors += 1
                    rows.append([cls, os.path.basename(p), "NETERR", "", ""])
                elif res == "BADIMG":
                    bad += 1
                    rows.append([cls, os.path.basename(p), "BADIMG", "", ""])
                else:
                    is_bb, sport = res
                    is_allowed = is_bb and sport != "volleyball"
                    if is_allowed:
                        allowed += 1
                    elif not is_bb:
                        blk_relevance += 1
                    else:
                        blk_volleyball += 1
                    rows.append([cls, os.path.basename(p), "ALLOW" if is_allowed else "BLOCK",
                                 is_bb, sport])
                if done % 25 == 0:
                    print(f"  {cls}: {done}/{len(imgs)}", flush=True)
        n_scored = len(imgs) - bad - errors
        per_class[cls] = {
            "n": len(imgs), "scored": n_scored, "allowed": allowed,
            "blk_relevance": blk_relevance, "blk_volleyball": blk_volleyball,
            "bad": bad, "errors": errors, "secs": round(time.perf_counter() - t0, 1),
        }

    # ---- report ----
    print("\n" + "=" * 74)
    print(f"  LIVE SERVER RELEVANCE-GATE EVALUATION  ({API})")
    print("=" * 74)
    correct = total = 0
    for cls in classes:
        s = per_class[cls]
        want_allow = EXPECT_ALLOW[cls]
        cls_correct = s["allowed"] if want_allow else (s["scored"] - s["allowed"])
        correct += cls_correct
        total += s["scored"]
        verdict = "ALLOW" if want_allow else "BLOCK"
        rate = cls_correct / max(1, s["scored"])
        print(f"\n  {cls:<14} n={s['n']} scored={s['scored']} (bad_img={s['bad']}, neterr={s['errors']}, {s['secs']}s) — want {verdict}")
        print(f"     allowed={s['allowed']}  blocked_by_relevance={s['blk_relevance']}  blocked_by_volleyball={s['blk_volleyball']}")
        print(f"     => correct {verdict} rate: {rate:.1%}  ({cls_correct}/{s['scored']})")

    print("\n" + "-" * 74)
    print(f"  OVERALL correct decisions: {correct}/{total} = {correct / max(1, total):.1%}")
    print("-" * 74)

    with open("results_live.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["class", "file", "decision", "is_basketball_court", "structure_sport"])
        w.writerows(rows)
    print("  per-image results -> results_live.csv\n")


if __name__ == "__main__":
    main()

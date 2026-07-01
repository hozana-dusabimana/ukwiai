# System Validation — Image Testing & Court-Type Discrimination

**Project:** UKWI — Construction Progress Monitoring (basketball-court construction)
**Date:** 2026-06-29
**Scope:** Validating that the AI correctly **admits basketball-court site photos** and **rejects everything else** (volleyball courts, other sports grounds, and non-court images), tested against the **live production service**.

> Addresses panel required action **#4** — *"Test the system using real or simulated construction site images and project data to validate performance and reliability."* It also underpins **#2** (reliable phase identification) by quantifying how reliably the relevance/sport gate behaves on real photos.

---

## Headline result

**≈80 % real-world validation accuracy.** On a real (web-collected) test set of **160 images across 4 classes**, the system makes the correct admit/reject decision **79.4 % of the time** (§3.2) — correctly admitting basketball-court photos and rejecting volleyball courts, other sports grounds, and non-court images. This is the figure to cite for real-world performance, because it is measured on **real images** with a full confusion matrix (§3) and a reproducible harness (§8).

> The trained CNN's **100 %** stage-accuracy in `basketball_court_cnn.meta.json` is **synthetic-only** (held-out images from the *same generator* used to train it) — it validates the training pipeline but is **not** a real-world accuracy claim, and should not be presented as the system's accuracy. A real-world *stage-classification* accuracy (which stage is this?) has not yet been measured — it needs a labelled real-photo test set (§7).

---

## 1. What was tested

The AI service exposes `POST /predict`, which returns — among other fields — two signals the backend uses to **admit or reject** a photo before it is analysed:

| Signal | Meaning |
|--------|---------|
| `is_basketball_court` | Relevance gate — is this a basketball-court construction scene at all? |
| `structure_sport` | `"basketball"` / `"volleyball"` / `"unknown"` from the detected court structures |

A photo is **ALLOWED** only if `is_basketball_court == True` **and** `structure_sport != "volleyball"` — exactly the two guards enforced in [`backend/app/api/v1/ai.py`](backend/app/api/v1/ai.py). Anything else is **BLOCKED**.

---

## 2. Test dataset

Images were collected by automated web image search (Bing, via the `icrawler` library — no API keys), grouped into four classes with a known expected verdict:

| Class | Collected | Expected verdict | Rationale |
|-------|-----------|------------------|-----------|
| `basketball` | 88 | **ALLOW** | the only court this system monitors |
| `volleyball` | 120 | **BLOCK** | looks identical to basketball in early phases — the hard case |
| `non_court` | 359 | **BLOCK** | faces, food, documents, rooms, animals, cars |
| `other_grounds` | 72 | **BLOCK** | football pitch, tennis court, athletics track |

Each evaluation run used a **balanced 40 images/class sample** (160 images) sent to the **live** endpoint `https://ai-ukwiai.isiri.rw/predict`, so inference ran on the production server in its real configuration (OWLv2 object detection active).

> **Label-noise caveat.** Web-search images are imperfectly labelled — some `basketball` results are stock/nature filler that *should* be blocked. This only **depresses** the basketball ALLOW-rate (a pessimistic floor); it does not inflate the BLOCK-rates, since mislabelled images in the other classes should be blocked anyway.

---

## 3. Results

### 3.1 Baseline (before hardening)

| Class | Want | Correct rate | Wrongly admitted |
|-------|------|--------------|------------------|
| basketball | ALLOW | **76.9%** (30/39) | — |
| volleyball | BLOCK | **47.5%** (19/40) | 21/40 |
| non_court | BLOCK | **80.0%** (32/40) | 8/40 |
| other_grounds | BLOCK | **33.3%** (13/39) | 26/39 |
| **Overall** | | **59.5%** (94/158) | |

**Diagnosis.** The gate effectively verified *"this is a sports court / construction surface"*, **not** *"this is specifically a basketball court."* Two root causes were found in the per-image data:
1. Any painted court with white lines and some metal was labelled `structure_sport = "basketball"` — so **volleyball, tennis and five-a-side courts passed as basketball** (15 volleyball + 10 other-ground images were mislabelled "basketball").
2. The relevance gate keyed on a **generic** "outdoor sports court" detection, so football pitches and tennis courts read as valid courts.

### 3.2 Hardened (after fixes)

| Class | Want | Correct rate | Wrongly admitted |
|-------|------|--------------|------------------|
| basketball | ALLOW | **65.0%** (26/40) | — |
| volleyball | BLOCK | **77.5%** (31/40) | 9/40 |
| non_court | BLOCK | **85.0%** (34/40) | 6/40 |
| other_grounds | BLOCK | **90.0%** (36/40) | 4/40 |
| **Overall** | | **79.4%** (127/160) | |

### 3.3 Before → after

| Class | Baseline | Hardened | Change |
|-------|----------|----------|--------|
| basketball (ALLOW) | 76.9% | 65.0% | **−11.9 pp** |
| volleyball (BLOCK) | 47.5% | 77.5% | **+30.0 pp** |
| non_court (BLOCK) | 80.0% | 85.0% | **+5.0 pp** |
| other_grounds (BLOCK) | 33.3% | 90.0% | **+56.7 pp** |
| **Overall correct** | **59.5%** | **79.4%** | **+19.9 pp** |

**Outcome.** The "allow only basketball grounds" objective is substantially better met: wrong-sport rejection rose across every class, most dramatically for other sports grounds (football/tennis/track: 33% → **90%**) and volleyball (48% → **78%**).

---

## 4. Changes that produced the improvement

| # | Change | File |
|---|--------|------|
| 1 | `structure_sport = "basketball"` now requires a **real backboard** detection — not the generic painted-court + lines + metal combo that volleyball/tennis/5-a-side courts also satisfy | [`ai_service/app/predictor.py`](ai_service/app/predictor.py) |
| 2 | Added **competing-sport prompts** (`tennis court`, `football goal post`) to the zero-shot detector, run at a **lower confidence threshold for recall** | [`ai_service/app/object_detection.py`](ai_service/app/object_detection.py) |
| 3 | The relevance gate now **rejects a competing-sport scene** (tennis/football with no backboard) instead of waving it through as a generic court | [`ai_service/app/predictor.py`](ai_service/app/predictor.py) |
| 4 | **Measurement gate (deterministic, all phases):** a court whose recorded footprint matches another sport (e.g. volleyball 18×9 m vs basketball 28×15 m) is **hard-rejected (HTTP 422)** before analysis | [`backend/app/services/cost_estimation.py`](backend/app/services/cost_estimation.py), [`backend/app/api/v1/ai.py`](backend/app/api/v1/ai.py) |

> The **measurement gate (#4)** is the most reliable discriminator and the only one that works in the **early earthworks phases (Stage 1–2)**, where a basketball and a volleyball site are visually identical and no structure exists yet — the footprint is the only distinguishing signal.

---

## 5. The trade-off (and how to tune it)

Basketball admission dropped **12 points** (77% → 65%). The per-image data shows the cause: the **low competing-sport detection threshold** (set for high recall) occasionally false-detects a "tennis court" / "football goal" / "volleyball net" on a *real* basketball court, which then fails the gate (12 of 14 wrong blocks were by the relevance gate; 2 by a false volleyball flag).

This is a controllable **precision ↔ recall** trade-off:

- The threshold is an environment variable — **`AI_WRONGSPORT_THRESHOLD`** (default `0.14`) — so it can be tuned **without code changes**.
- `0.14` is biased toward rejection (matches the "only basketball" requirement).
- Raising it to ≈`0.18` would recover basketball admission at the cost of slightly less volleyball/other-sport recall.

Combined with the **label-noise caveat** (§2), the true basketball-court admission rate is higher than the measured 65%.

---

## 6. Reliability finding — concurrency hardening

During testing, sending several concurrent requests revealed a **production robustness bug**: the AI service ran a single worker and executed OWLv2 inference **synchronously in the request handler**, so a burst of concurrent uploads blocked the event loop, the request backlog grew unbounded, and even `/health` stopped responding — the service appeared **down**.

**Fix** ([`ai_service/app/main.py`](ai_service/app/main.py)):
- Inference now runs in a worker thread (`asyncio.to_thread`) so `/health` stays responsive during inference.
- A **semaphore + queue cap** (`AI_MAX_CONCURRENT_INFER=2`, `AI_MAX_QUEUED_INFER=8`) bounds load; excess requests are shed with a fast **HTTP 503** instead of piling up.

**Validation:** the full 160-image hardened run completed with **0 network errors**, and `/health` answered in **~0.5–1.0 s throughout** under continuous inference load (it previously timed out at 25 s+ under the same load).

---

## 7. Limitations & next steps

- **Label noise** in the web-collected dataset (§2) makes the basketball admission rate a pessimistic floor. A curated, hand-labelled set of real basketball-court site photos would give a cleaner number — and is also the dataset needed to train/validate the CNN (panel action **#1**).
- **OWLv2 zero-shot recall** for volleyball/tennis/football is imperfect; the measurement gate (§4) is the robust backstop for the early phases the detector cannot resolve.
- **Recommended tuning:** a small increase of `AI_WRONGSPORT_THRESHOLD` (→ ~0.18) to rebalance basketball admission, then re-measure.

---

## 8. Reproducing this evaluation

The harness lives in [`eval/`](eval/). It sends a folder of images to the live endpoint and computes the confusion matrix:

```bash
cd eval
pip install icrawler requests          # one-time

# 1. Collect images (no API keys; Bing via icrawler)
python download_images.py 250 data

# 2. Evaluate against the LIVE production server (inference runs on the server)
python evaluate_live.py data 40 2      # 40 images/class, 2 concurrent workers
# -> prints the per-class ALLOW/BLOCK matrix and writes results_live.csv
```

| File | Purpose |
|------|---------|
| [`eval/download_images.py`](eval/download_images.py) | builds the 4-class image set via Bing search |
| [`eval/evaluate_live.py`](eval/evaluate_live.py) | scores a folder against the **live** server and prints the matrix |
| [`eval/evaluate.py`](eval/evaluate.py) | same, but runs the predictor **locally** (heuristic / OWLv2) |
| [`eval/results_hardened.csv`](eval/results_hardened.csv) | per-image verdicts from the hardened run in §3.2 (evidence) |

Per-image verdicts are recorded as `class, file, decision, is_basketball_court, structure_sport`.

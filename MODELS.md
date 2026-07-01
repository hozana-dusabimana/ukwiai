# Models

The AI service uses three prediction layers plus a cost-prediction engine. This document describes each one: what it is, how it is used, whether **we** trained it (and how), and why it was chosen over the alternatives.

| # | Model | Role | Trained by us? |
|---|-------|------|----------------|
| 1 | MobileNetV2 two-headed CNN | Main stage classifier + progress regressor | **Yes** — transfer-learned in-house on our own synthetic dataset (ImageNet-pretrained backbone, frozen) |
| 2 | OWLv2 (`google/owlv2-base-patch16-ensemble`) | Zero-shot detection of court structures (backboards, fences, poles) + photo relevance gate | No — used pretrained, zero-shot by design (no training needed or performed) |
| 3 | OpenCV heuristic fallback | Keeps the service functional when no trained model is available | N/A — hand-coded rules, not a learned model |
| 4 | Material BOM + market-price cost engine | Predicts the **actual market cost** of each stage from materials, terrain & market — independent of the planning budget | N/A — deterministic, auditable engine (no labelled-cost dataset exists; see below) |
| 5 | OpenCV terrain analyzer | Scores a site-background photo into a difficulty multiplier that inflates terrain-sensitive stage costs | N/A — hand-coded CV heuristic |

> **Cost prediction (layers 4–5).** Layers 1–3 answer *"what stage is this and how far along?"*. Layers 4–5 answer *"what does that actually cost here?"* — pricing a bill of materials (scaled to the court geometry) at live market prices and inflating it by the site's terrain difficulty. The result is **not** pegged to the budget typed in at planning: a hard site or a hot market predicts a cost above the plan, which is exactly what drives the over-budget alerts. See section 4 below.

---

## 1. MobileNetV2 two-headed CNN — *trained by us*

**File:** [`ai_service/app/model_arch.py`](ai_service/app/model_arch.py) · **Weights:** `ai_service/models/basketball_court_cnn.h5`

### What it is

A TensorFlow/Keras transfer-learning model:

- **Backbone:** MobileNetV2 (~3.5 M parameters, ~14 MB), pretrained on ImageNet by Google. We keep it **frozen** during training (`unfreeze: false`).
- **Two custom heads** (these are the parts we trained from scratch):
  - `stage` — Dense(192) → softmax over the **7 construction stages** (sparse categorical cross-entropy)
  - `progress` — Dense(96) → single sigmoid in [0, 1], scaled to a **0–100 % progress estimate** (MSE)
- **Input:** 224×224×3 RGB, rescaled from [0, 1] to the [-1, +1] range MobileNetV2 expects.

### How it is used

The backend forwards each uploaded site photo to the AI service (`POST /api/ai/analyze-image`). The singleton predictor ([`ai_service/app/predictor.py`](ai_service/app/predictor.py)) lazy-loads the `.h5` weights, preprocesses the image, and returns the predicted stage, progress %, confidence label, a human-readable summary, and next-step advice.

### How we trained it

We trained it on **~2,400 procedurally generated synthetic images** produced by our own generator, [`ai_service/app/training/synthesize.py`](ai_service/app/training/synthesize.py), which renders all seven stages with realistic variation (lighting, perspective, court colours, hoops, fences). Filenames encode per-image progress (`*_pNN.jpg`) so the regressor head learns fine-grained progress within a stage.

The exact commands:

```bash
cd backend
docker compose exec ai_service python -m app.training.synthesize \
    --out /app/data --train-per-class 250 --val-per-class 60 --test-per-class 30

docker compose exec ai_service python -m app.training.train \
    --data /app/data --epochs 12 --batch 16 \
    --output /app/models/basketball_court_cnn.h5
```

End-to-end runtime on `tensorflow-cpu`: **~25 minutes** on a CPU laptop (no GPU required).

### Recorded training run (from `ai_service/models/basketball_court_cnn.meta.json`)

| Setting | Value |
|---------|-------|
| Input size | 224×224 |
| Epochs | 12 scheduled, 11 ran (early stopping / LR schedule) |
| Batch size | 16 |
| Backbone | Frozen (`unfreeze: false`) — heads only |
| Optimizer | Adam, LR 1e-3 stepped down to 5e-4 then 2.5e-4 |

| Metric | Result (synthetic held-out) |
|--------|--------|
| Test stage accuracy | 100 % (210/210 held-out images) |
| Test progress MAE | 0.048 (≈ ±4.8 progress points) |
| Final validation stage accuracy | 100 % |
| Final validation progress MAE | 0.045 |

> ⚠️ **These figures are on *synthetic* data, not a real-world accuracy claim.** The held-out test set was produced by the **same generator** ([`synthesize.py`](ai_service/app/training/synthesize.py)) as the training set, so 100 % reflects that the training pipeline converges and the canonical stage patterns are learnable — **not** how the model performs on real site photos. Do **not** cite 100 % as the system's accuracy. The figure measured on **real images** is **≈80 % (79.4 %)** validation accuracy — see [`EVALUATION.md`](EVALUATION.md). A real-world *stage-classification* accuracy still needs a labelled real-photo test set (see below).

The predictor refuses to load a degenerate checkpoint: if the side-car metadata reports validation stage-accuracy at or below ~random (1/7, with margin → 0.20), it discards the model and uses the heuristic instead.

### Fine-tuning on real field photos (next step for production accuracy)

Synthetic training transfers well to real photos that match the canonical stage patterns, but production accuracy on UKWI's actual sites needs real labelled photos. Drop them under `ai_service/data/{train,val,test}/stage_1..stage_7/` (≥ 200 images per class recommended) and re-run the trainer; add `--unfreeze` to also fine-tune the MobileNetV2 backbone after the first phase converges.

### Why MobileNetV2 and not a bigger backbone (ResNet50, EfficientNet, …)

Documented in [`model_arch.py`](ai_service/app/model_arch.py):

1. **The project trains on a CPU laptop.** MobileNetV2 is ~3.5 M params / ~14 MB and trains end-to-end in ~25 minutes on `tensorflow-cpu`; ResN50-class backbones are several times slower for no benefit here.
2. **ImageNet features already cover what we need.** The discriminative textures for construction stages — grass, soil, gravel, concrete, metal, paint — are well represented in ImageNet-pretrained features, so a larger backbone adds cost without adding signal.
3. **Small dataset.** With ~2,400 training images, a larger backbone would overfit more easily; a compact frozen backbone with small heads is the right capacity.

---

## 2. OWLv2 zero-shot object detection — *not trained by us (zero-shot by design)*

**File:** [`ai_service/app/object_detection.py`](ai_service/app/object_detection.py) · **Weights:** `google/owlv2-base-patch16-ensemble` (HuggingFace, ~600 MB, downloaded on first use)

### What it is

Google's OWLv2 open-vocabulary detector, used **zero-shot**: we give it natural-language prompts and it finds matching objects with **no task-specific training whatsoever** — that is the entire point of choosing it. Our prompts:

`basketball backboard`, `chain-link fence`, `basketball pole`, `basketball hoop`, `basketball court`, `outdoor sports court`, `concrete pavement`, `construction site`, `volleyball net`, `volleyball net post`

### Telling a basketball court apart from a volleyball one

This system monitors **basketball** courts, but a basketball and a volleyball court are *visually identical in the early earthworks phases* (Stage 1 site clearing, Stage 2 sub-base) — bare ground and gravel carry no sport-specific feature. The two are separated on **two independent bases**, so the question is answerable in every phase:

1. **Measurement (works in Stages 1–7, deterministic, always-on).** A basketball playing area is FIBA **28 × 15 m (420 m²)**; a volleyball court is FIVB **18 × 9 m (162 m²)**. The cleared/sub-base **footprint** alone separates them long before any hoop or net exists. `classify_court_sport()` ([`backend/app/services/cost_estimation.py`](backend/app/services/cost_estimation.py)) compares the project's measured footprint to both standards in log-area space and only commits with a clear margin (otherwise → *uncertain*). A footprint that clearly matches another sport is **rejected outright (HTTP 422, Guard 1c)** before anything is persisted; only an *ambiguous* size (between the two standards) falls back to a soft warning.
2. **Structure (Stages 4–7, when OWLv2 is enabled).** A basketball court's only sport-specific structure is the **backboard**, so `structure_sport` is `"basketball"` **only** when a real backboard is detected — a painted court with white lines and some metal is *not* basketball-specific (volleyball, tennis and five-a-side courts share it), and treating it as basketball is what let other sports pass in evaluation. Competing-sport prompts (`volleyball net`, `volleyball net post`, `tennis court`, `football goal post`) run at a **lower threshold for recall**; a competing structure seen with **no backboard** flags the wrong sport — volleyball sets `structure_sport = "volleyball"` (specific 422 message), while a tennis court / football goal fails the relevance gate (generic 422). This was added after a live evaluation found the gate was passing ~half of volleyball courts and two-thirds of other sports grounds.

### How it is used

Two jobs inside the predictor:

1. **Stage 6/7 scoring** — pixel-only rules can't tell a backboard from a worker's shirt; OWLv2 detections of backboards, poles and fencing are what make Hoop Installation (6) and Fencing/Final Works (7) reliably reachable.
2. **Relevance gate** — detections across the court/construction prompts count as evidence that a photo really is a basketball-court site, so photos of people, food, documents or animals get rejected.

It is **lazy-loaded and fully optional**: if `torch`/`transformers` are missing, loading fails, or `AI_DISABLE_OBJDET=1` is set, detection returns empty and the heuristic carries on without it. Tunables: `AI_OBJDET_MODEL` (model id), `AI_OBJDET_THRESHOLD` (default 0.20, tuned for precision on real construction photos).

> **Production note:** the ~600 MB weights + torch runtime can exhaust memory on small hosts, so production currently runs with `AI_DISABLE_OBJDET=1` (heuristic-only relevance gate). Re-enable on a larger instance.

### Why OWLv2 and not a trained detector (YOLO, Faster R-CNN, …)

A conventional detector would require a labelled bounding-box dataset of court structures — which doesn't exist for this project and would be expensive to build. OWLv2 gives backboard/fence/pole detection **for free from text prompts**, with zero training data, zero training time, and the ability to add new object classes by editing a string list. The trade-off is runtime size, which is why it is optional and disableable.

---

## 3. OpenCV heuristic fallback — *no training (rule-based, not a model)*

**File:** [`ai_service/app/predictor.py`](ai_service/app/predictor.py)

### What it is

A deterministic computer-vision pipeline with **no learned parameters**: colour-ratio analysis, court-line-marking detection (`HoughLinesP` on white pixels), and vertical-pole detection. There is nothing to train — its behaviour is fully specified by hand-written rules and is covered by per-stage scenario tests.

### How it is used

It activates automatically whenever:

- `basketball_court_cnn.h5` is missing, or
- the side-car metadata marks the trained checkpoint as degenerate (validation accuracy ≤ random baseline).

Responses then carry a `model_version` ending in `-fallback`.

### Why have it at all

It guarantees the service is never down for lack of a model file: tests run without weights, fresh deployments work immediately, and a bad training run can't silently ship garbage predictions.

---

## 4. Material BOM + market-price cost engine — *deterministic (not trained)*

**Files:** [`ai_service/app/cost_model.py`](ai_service/app/cost_model.py) (bill of materials), [`ai_service/app/market_prices.py`](ai_service/app/market_prices.py) (market unit prices), [`ai_service/app/terrain.py`](ai_service/app/terrain.py) (terrain difficulty).

### What it is

Given the detected stage, the court geometry, the site's terrain difficulty and a market index, the engine builds a fully itemised, market-priced cost for **every** stage:

```
quantity (court area / perimeter)
  × market unit price (market_prices, scaled by market_index)
  = line total
Σ line totals + labour  = stage subtotal
  × effective terrain multiplier (per-stage terrain sensitivity)
  = stage total          ──►  with a low/high band from material volatility
```

The bill is **independent of the planning budget** — so a stage's predicted cost can come out *above* its planned allocation when the materials, terrain or market say so. That overrun is what drives the over-budget alerts. Each material reports a low/expected/high band so the market's natural price variation shows as a range, and a single `AI_MARKET_INDEX` (regional cost-of-living / inflation / FX) re-prices the whole catalogue.

### How it is used

`POST /predict` accepts `area_m2`, `perimeter_m`, `terrain_multiplier` and `market_index` form fields (the backend fills them from the project: court dimensions, the terrain assessed at setup, and config). The response gains `materials_visible`, a full `cost_prediction` bill, and the `predicted_stage_cost` for the detected stage. The backend rolls the per-stage market totals into `project_stages.ai_predicted_cost`, which feeds the variance/deviation engine and the dashboards.

**Money consumed so far (predicted from the photo).** The response also carries `money_consumed` — the cumulative market cost *up to the detected stage*: every stage **before** the detected one priced in full, **plus** the detected stage pro-rated by its within-stage progress (`consumed_estimate()` in [`cost_model.py`](ai_service/app/cost_model.py)). This is the "money already spent" figure the site sees the moment a progress photo is analysed, distinct from `project_total` (the cost of the whole build) and from the planning budget.

### Why a BOM engine and not a trained cost regressor

No labelled cost dataset exists for this project, and one would be expensive and contentious to build. A deterministic BOM keyed on real market prices is **explainable** (a site engineer can read the bill and see why a stage costs what it does), **auditable**, and **trivially tunable** — the prices live in one table and can be swapped for a live feed. A black-box price regressor would be neither, and is far harder to defend in a final-year review.

---

## 5. OpenCV terrain analyzer — *deterministic (not trained)*

**File:** [`ai_service/app/terrain.py`](ai_service/app/terrain.py)

### What it is

At project setup the user uploads a photo of the raw plot. `POST /assess-terrain` scores it on four readable signals — **vegetation** (green coverage → clearing), **roughness** (texture energy → rocky excavation), **slope** (vertical intensity gradient + horizon tilt → cut/fill) and **wetness** (dark/blue low-lying patches → drainage) — into a difficulty multiplier in ≈[0.85, 1.80]. The backend stores it on the project and the cost engine applies it per stage, weighted by each stage's terrain sensitivity (earthworks suffer most; painting barely cares).

### Why a heuristic

There is no "how hard is this plot" training set, and the signals (greenery, rockiness, slope, water) are directly measurable with classical CV. The multiplier is clamped server-side so a pathological photo can't produce a runaway cost.

---

## Runtime selection (fallback chain)

```
photo → relevance gate (OWLv2 detections if loaded, else lenient heuristic flags)
      → trained MobileNetV2 CNN          if .h5 exists and metadata passes the sanity check
      → OpenCV heuristic (+ OWLv2 hints) otherwise
```

Check which path is live via `GET /api/ai/model-info` — `using_fallback: false` and a `model_version` without the `-fallback` suffix means the trained CNN is serving predictions.

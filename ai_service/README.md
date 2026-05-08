# UKWI AI Service

Computer-vision microservice for basketball-court construction-progress estimation.
Takes a site photo, returns the predicted construction stage (1-7) with an
estimated overall progress percentage and a confidence score.

The service runs as a FastAPI app on port `8001` and is consumed by the backend's
`/api/v1/ai/analyze-image` endpoint, which adds project context (budget, expense
records) and persists the result. **You do not normally call this service
directly from the frontend** — go through the backend.

---

## Quick reference

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health`         | Liveness probe. Reports whether the model is loaded or running on the heuristic fallback. |
| `GET`  | `/model-info`     | Model version, input size, the 7-stage taxonomy, and `using_fallback`. |
| `GET`  | `/stages`         | The canonical 7-stage list with progress ranges and cost-percentage weights. |
| `POST` | `/predict`        | Single-image prediction. Multipart form with `file=<image>`. |
| `POST` | `/predict-batch`  | Multi-image prediction. Multipart form with multiple `files=<image>` parts. |

### The 7 construction stages

| # | Stage | Progress band | Cost % | Visual cue |
|---|---|---|---|---|
| 1 | Site Clearing & Excavation       | 0-10%   | 8%  | Bare ground, machinery, soil heaps |
| 2 | Sub-base Preparation             | 10-25%  | 12% | Compacted gravel pad, edge stakes |
| 3 | Base Layer / Concrete Slab       | 25-45%  | 25% | Bright grey concrete, formwork, rebar |
| 4 | Surface Finishing (Asphalt/Acrylic) | 45-65%  | 22% | Smooth dark/coloured court surface |
| 5 | Court Line Marking & Painting    | 65-80%  | 13% | Painted lines, key, three-point arc |
| 6 | Hoops & Backboards Installation  | 80-92%  | 12% | Poles, backboards, rims, nets |
| 7 | Fencing & Final Touches          | 92-100% | 8%  | Perimeter chain-link fence, lighting |

These are defined once in [`app/stages.py`](app/stages.py) and consumed by both
the Python predictor and the SQL seed in `database/init.sql` — keep them in sync.

---

## Training the model

The shipped `models/basketball_court_cnn.h5` may or may not be useful. The
predictor runs a sanity check on startup: if the side-car `.meta.json` reports
a validation stage-accuracy below the random baseline (≈14% for 7 classes), the
file is **rejected** and the service falls back to a hand-coded heuristic.
This protects against a previous incident where a collapsed checkpoint shipped
with `val_stage_acc=0.005` and confidently predicted stage 1 for everything.

### Prerequisites

- Docker Desktop running
- Disk space: ~3 GB for the image, +1 GB for synthetic data, +200 MB per
  trained checkpoint
- (Optional, for the Kaggle source) a real `kaggle.json` from
  [kaggle.com/settings](https://www.kaggle.com/settings) placed at
  `%USERPROFILE%\.kaggle\kaggle.json`. The training script bind-mounts this
  read-only into the container automatically when present.

### One-shot training (Windows)

From the **project root** (not from inside `ai_service`):

```powershell
docker compose build ai_service                      # bake latest code into the image
./ai_service/scripts/train_locally.ps1               # synthetic only, no auth needed
docker compose restart ai_service                    # load the new weights
```

That's the whole loop. The script prepares ~3,700 synthetic images, trains
MobileNetV2 for 12 epochs with EarlyStopping, and writes the new
`models/basketball_court_cnn.h5`.

**Expected runtime: 3-6 hours on a CPU laptop.** Start it before bed.

### Training options

```powershell
# Larger synthetic dataset (slower but better generalisation):
./ai_service/scripts/train_locally.ps1 `
    -SyntheticTrain 800 -SyntheticVal 150 -SyntheticTest 80 `
    -Epochs 16

# Add a Kaggle construction dataset (auto-remapped to the 7 stages):
./ai_service/scripts/train_locally.ps1 -KaggleDataset 'owner/dataset-slug'

# Add your own labelled real photos (best accuracy boost):
#   place them under ai_service/data/manual/stage_1/, stage_2/, ... stage_7/
./ai_service/scripts/train_locally.ps1 -ManualRoot '/app/data/manual'
```

All three sources can be combined in a single run:

```powershell
./ai_service/scripts/train_locally.ps1 `
    -KaggleDataset 'owner/slug' -ManualRoot '/app/data/manual'
```

### What a healthy training run looks like

```
Epoch 1/12  loss: 1.20 - stage_acc: 0.32 - val_stage_acc: 0.45
Epoch 4/12  loss: 0.45 - stage_acc: 0.78 - val_stage_acc: 0.74
Epoch 8/12  loss: 0.21 - stage_acc: 0.91 - val_stage_acc: 0.83
Epoch 12/12 loss: 0.15 - stage_acc: 0.95 - val_stage_acc: 0.85   <- target
```

If `val_stage_acc` stays around 0.14 (random baseline) for more than 3 epochs,
the run has collapsed. Stop it (Ctrl-C) and check:

- That the dataset directories actually contain images (`ls ai_service/data/train/stage_*/`).
- That the dict-output fix in `app/model_arch.py` is present (search for `outputs={"stage": stage_out, "progress": progress_out}` — it must be a dict, never a list).

### Realistic accuracy expectations

| Dataset | Synthetic test accuracy | Real-photo accuracy |
|---|---|---|
| Synthetic only         | 80-95% | **50-70%** (synthetic-to-real domain gap) |
| Synthetic + 200 manual | 85-95% | **75-85%** |
| Synthetic + 500 manual + Kaggle | 90-97% | **80-92%** |

To break 80% on real construction photos you need real photos in training.
Public Kaggle datasets help but rarely cover all 7 stages well; the
**single highest-leverage thing you can do is collect and label 200-300 real
photos yourself**.

---

## Dataset preparation

`app/training/prepare_data.py` builds the `data/{train,val,test}/stage_N/`
layout the trainer expects from any combination of three sources:

1. **Synthetic** — generated by `app/training/synthesize.py`. Multi-octave
   noise textures, machinery silhouettes, painted court lines, optional
   chain-link fence, colour-temperature jitter. Always runs.
2. **Kaggle** — downloaded by the `kaggle` CLI. Folder names and filenames are
   passed through a keyword remapper (`KEYWORD_TO_STAGE` in `prepare_data.py`)
   that maps "excavation" → stage 1, "concrete" → stage 3, "fence" → stage 7,
   etc. Anything that doesn't match a keyword is counted as `kaggle_unmapped`
   in the manifest and dropped.
3. **Manual** — a folder you provide, structured exactly like the output:
   `manual_root/stage_1/...` through `manual_root/stage_7/...`. Most useful
   for fine-tuning on real photos you've labelled by hand.

After preparation, `data/manifest.json` summarises counts per source and per
final stage so you can sanity-check class balance before training.

### Adding a new Kaggle dataset

If a Kaggle dataset's class names don't match the keyword list in
`prepare_data.py`, extend `KEYWORD_TO_STAGE`:

```python
KEYWORD_TO_STAGE = {
    # ...existing keys
    "footing":   2,   # adds "footing" → stage 2 (sub-base)
    "rebar":     2,   # already present
    "screed":    3,   # adds "screed" → stage 3 (concrete)
}
```

Re-run `prepare_data.py` to pick up the new mapping.

---

## Model architecture

[`app/model_arch.py`](app/model_arch.py) — two-headed CNN:

- **Backbone**: MobileNetV2 (ImageNet pretrained, ~3.5M params). Chosen because
  it trains and serves on a CPU laptop. Swap to `EfficientNetV2S` for higher
  accuracy if you have a GPU.
- **Stage head**: 7-class softmax, trained with sparse categorical cross-entropy.
- **Progress head**: 1-unit sigmoid in `[0, 1]`, trained with MSE. The
  predictor scales it back to `[0, 100]` and clamps to the predicted stage's
  band.

Loss weights are `{"stage": 1.0, "progress": 0.5}` — both heads contribute
real gradient signal. **An earlier version had `progress: 0.005` and used a
list-output model with a Lambda × 100 wrapper; that combination silently
mis-routed labels in Keras 3 and collapsed the model.** If you change the
output shape, double-check the dict-keyed routing in
`Model(outputs={"stage": ..., "progress": ...})` is preserved.

---

## Heuristic fallback (when there's no usable trained model)

`app/predictor.py` ships with a deterministic computer-vision heuristic that
runs whenever no acceptable trained model is loaded. It uses:

- **Centre-weighted feature ratios** (soil, gravel, slab, asphalt, white,
  metal) so perimeter clutter doesn't outweigh the central court.
- **Connected-component slab detector** — finds the largest rectangular
  low-saturation blob and uses it as anchor evidence.
- **HoughLinesP** for white court markings (lines pass `s<35 & v>195`).
- **HoughLinesP** for near-vertical poles (lights / hoop posts / fence posts).
- **HoughLinesP** for diagonal lines (chain-link fence X-pattern → stage 7).
- **Hard evidence overrides**: court lines or a strong slab blob force stages
  1-2 to strongly negative scores so they cannot win on a built court.

The heuristic correctly classifies **stages 1, 5, 6, 7 reliably**. It
struggles with stages 2, 3, 4 (gravel-vs-concrete-vs-asphalt are visually
similar) and with photos where lighting / dirt has darkened the court paint.
This is its fundamental ceiling — the trained CNN supersedes it once trained.

---

## Project structure

```
ai_service/
├── app/
│   ├── main.py             FastAPI app (/health, /predict, /model-info, /stages)
│   ├── predictor.py        Predictor singleton: model load + sanity check + heuristic
│   ├── model_arch.py       Two-headed CNN (MobileNetV2 + stage/progress heads)
│   ├── preprocessing.py    Letterbox resize + light denoise + normalisation
│   ├── stages.py           Canonical 7-stage taxonomy (single source of truth)
│   └── training/
│       ├── prepare_data.py Combines synthetic + Kaggle + manual into train/val/test
│       ├── synthesize.py   Procedural rendering of the 7 stages
│       ├── dataset.py      Loads images into a tf.data.Dataset with augmentation
│       └── train.py        Training loop with EarlyStopping + ReduceLROnPlateau
├── models/                 .h5 weights + .meta.json side-car (validation history)
├── data/                   Generated by prepare_data.py (gitignored). Holds train/val/test.
├── scripts/
│   └── train_locally.ps1   Docker-based one-shot training wrapper for Windows
├── tests/                  Pytest suite (run with `docker compose run ai_service pytest`)
├── Dockerfile
└── requirements.txt
```

---

## Troubleshooting

### "Heuristic fallback in use" appears in every response

The trained model on disk was rejected by the sanity check. Look at
`ai_service/models/basketball_court_cnn.meta.json` — if `val_stage_acc` is
below `1/7 ≈ 0.143`, the model is collapsed. Re-train.

### `ValueError: filepath provided must end in '.weights.h5'`

Keras 3 changed the rule. The fix is already in `train.py` (the
`ModelCheckpoint` filepath ends with `.best.weights.h5`); only re-emerges if
someone reverts that line.

### Training crashes with OOM

CPU memory is the bottleneck on Windows. Lower the batch size:

```powershell
./ai_service/scripts/train_locally.ps1 -Batch 8
```

### `kaggle CLI not on PATH` warning

The `kaggle` package is in `requirements.txt`, but the dataset download will
silently skip if the CLI binary isn't reachable. This means your `kaggle.json`
isn't mounted — verify `%USERPROFILE%\.kaggle\kaggle.json` exists on the host
before running the script.

### Predictions are right but progress is stuck at the band edges

The within-band position is computed from the top-2 score margin. When the
heuristic is very confident, position saturates to 1.0 and progress lands at
the upper edge of the band (e.g. 9.99% for stage 1, 44.99% for stage 3).
This is expected for a confident heuristic and improves once a trained CNN
takes over.

### After training, the new model isn't being used

The container caches the model in memory at startup. Restart it:

```powershell
docker compose restart ai_service
```

Then check `GET /health` — `using_fallback` should be `false`.

---

## Running tests

```powershell
docker compose run --rm --no-deps ai_service pytest -v
```

Tests cover the heuristic, preprocessing pipeline, and the FastAPI handlers.
They do not require a trained model.

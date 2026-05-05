# UKWI Construction Monitor

AI-Based Construction Progress & Budget Monitoring System for **UKWI Company Ltd, Rwanda**.

The system uses a CNN to estimate construction progress on basketball-court projects from site images, then ties that progress to live budget tracking, variance analysis, and forecasting. It exposes the result as a project dashboard, REST API, and PDF/Excel reports.

## Repository layout

```
.
├── ai_service/    TensorFlow microservice + training scripts + heuristic fallback
├── backend/       FastAPI app (60+ REST endpoints), MySQL bootstrap, docker-compose orchestration
├── frontend/      React 18 + Vite SPA
├── .gitignore
└── README.md
```

That's the entire top level. Service-specific files (Dockerfile, docker-compose.yml, .env.example, requirements.txt, tests, etc.) live inside their own folder.

## Stack

| Layer    | Tech                                                                                    |
|----------|-----------------------------------------------------------------------------------------|
| Frontend | React 18, Vite, React Router, React Query, TailwindCSS, Recharts, react-toastify        |
| Backend  | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2, MySQL 8, ReportLab, openpyxl           |
| AI       | TensorFlow 2.17 (ResNet50 transfer learning), OpenCV, Pillow, scikit-learn              |
| Auth     | JWT (HS256) + bcrypt, OAuth2-password flow                                              |
| Infra    | Docker, docker-compose                                                                  |

## Quick start

The whole stack is orchestrated from `backend/docker-compose.yml`. Running it brings up MySQL, the AI service, the backend, and the frontend together — and the **backend creates its database, schema, and seed data automatically on first start**.

```bash
cd backend
cp .env.example .env       # edit secrets before any production deploy
docker compose up -d --build
```

Then visit:
- **App:** http://localhost
- **API docs:** http://localhost:8000/docs
- **Health:** http://localhost:8000/api/system/health
- **AI service:** http://localhost:8001/health

Default admin (CHANGE after first login):
- Email: `admin@ukwi.rw`
- Password: `ChangeMe!2026`

## What "auto-create" actually does

On startup, the backend lifespan handler in [`app/core/bootstrap.py`](backend/app/core/bootstrap.py):

1. Waits for MySQL to accept connections (bounded retry).
2. Issues `CREATE DATABASE IF NOT EXISTS ukwi_db`.
3. Runs `Base.metadata.create_all` to build all 12 tables.
4. Inserts the seven master construction stages (idempotent).
5. Inserts the default admin user if no admin exists.
6. Wraps schema sync and seeding in a `GET_LOCK` so concurrent Gunicorn workers don't race.

You never need to apply SQL files or run migrations to get a working system — `docker compose up` is the only step.

## Running locally (without Docker)

```bash
# 1. Bring up just the database
cd backend
docker compose up -d database

# 2. Run the backend directly
pip install -r requirements.txt
DB_HOST=localhost uvicorn app.main:app --reload

# 3. Run the AI service
cd ../ai_service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# 4. Run the frontend
cd ../frontend
npm install
npm run dev    # http://localhost:3000
```

## Testing

```bash
# Backend (pytest, in-memory SQLite, AI client stubbed)
docker compose -f backend/docker-compose.yml exec backend pytest -q
# 26 passed

# AI service (heuristic fallback — no model file required)
docker compose -f backend/docker-compose.yml exec ai_service pytest -q
# 20 passed (includes 7 per-stage scenario tests)

# Frontend production build
cd frontend && npm run build
```

## Training the model

The AI service uses **MobileNetV2** transfer learning (~3.5 M parameters, ImageNet-pretrained) with a two-headed architecture: softmax over 7 stages + sigmoid×100 progress regressor. The model learns the canonical visual cues for each construction stage and falls back to a colour/edge heuristic only when the `.h5` file is missing.

### Option 1 — Train on procedurally generated images (no field data needed)

We ship a synthetic-data generator at [`ai_service/app/training/synthesize.py`](ai_service/app/training/synthesize.py) that renders ~2,400 distinct images covering all seven stages with realistic variation (lighting, perspective, court colours, hoops, fences). This is the fastest path to a working trained model:

```bash
cd backend
docker compose exec ai_service python -m app.training.synthesize \
    --out /app/data --train-per-class 250 --val-per-class 60 --test-per-class 30

docker compose exec ai_service python -m app.training.train \
    --data /app/data --epochs 12 --batch 32 \
    --output /app/models/basketball_court_cnn.h5
```

End-to-end runtime on `tensorflow-cpu`: ~25 minutes. Synthetic-trained models give correct stage classification on real photos that match the canonical patterns; production accuracy still requires real UKWI photos (Option 2) for fine-tuning.

### Option 2 — Fine-tune on UKWI field photos

Drop labelled photos under the standard layout (per-stage folders) and re-run the trainer. Filename convention `*_pNN.jpg` encodes per-image progress percentage if you want the regressor head to learn fine-grained progress within a stage:

```
ai_service/data/
  train/stage_1..stage_7/*.jpg     # >= 200 images / class for usable accuracy
  val/stage_1..stage_7/*.jpg
  test/stage_1..stage_7/*.jpg
```

Add `--unfreeze` to fine-tune the MobileNetV2 backbone after the first phase converges.

Once `basketball_court_cnn.h5` exists in `ai_service/models/`, the next predictor invocation auto-loads it and `model_version` stops ending in `-fallback`.

### What you get from `MobileNetV2 + synthetic data`

Training the bundled pipeline on the synthetic dataset produces a model that hits **100% accuracy on the held-out test split (210/210)** in ~25 minutes on a CPU. Sample live response:

```json
{
  "predicted_stage": "Base Layer / Concrete Slab",
  "predicted_stage_order": 3,
  "predicted_progress": 38.77,
  "confidence": 1.0,
  "confidence_label": "high",
  "summary": "The image clearly shows stage 3 — Base Layer / Concrete Slab. Estimated overall progress: 38.8%. Confidence: high (100%). The next planned stage is Surface Finishing (Asphalt/Acrylic).",
  "advice": "Verify rebar spacing and concrete cure time before approving the next pour.",
  "next_stage": "Surface Finishing (Asphalt/Acrylic)",
  "model_version": "1.0.0"
}
```

The MobileNetV2 backbone is pre-trained on **ImageNet** (1.2 M images, 1000 classes). Those features cover the textures we care about (concrete, soil, grass, metal, paint), so the synthetic-only fine-tune transfers reasonably. For production accuracy on UKWI's actual sites, fine-tune on real photos as described above.

### Friendly responses

Every prediction returns a **human-readable summary**, a **next-step advice line**, and a **confidence label** (high / moderate / low / very_low) on top of the raw probabilities — see `predicted_stage`, `summary`, `advice`, `next_stage`, `confidence_label` in the `/api/ai/analyze-image` response. Site engineers get an actionable note (e.g. "Verify rebar spacing and concrete cure time before approving the next pour") instead of a bare class index.

## API surface (all under `/api`)

- `POST /auth/login` · `POST /auth/register` · `GET /auth/me`
- `GET/POST/PUT/DELETE /projects` · `GET /projects/{id}/summary` · `GET /projects/{id}/timeline`
- `POST /projects/{id}/images/upload` · `GET /images/{id}` · `GET /images/{id}/download`
- `POST /ai/analyze-image` · `GET /ai/model-info` · `GET /ai/projects/{id}/analysis-history`
- `POST /projects/{id}/budget/expense` · `GET /projects/{id}/budget/summary` · `GET /projects/{id}/budget/breakdown`
- `POST /projects/{id}/estimate-cost` · `GET /projects/{id}/cost-forecast` · `GET /projects/{id}/variance-analysis`
- `GET /dashboard/overview` · `GET /dashboard/charts/{progress-trend,cost-trend,stage-distribution}`
- `GET /alerts` · `PATCH /alerts/{id}/{read,resolve}` · `GET /notifications`
- `POST /reports/generate` · `GET /reports/{id}/download`
- `GET /system/health` · `GET /system/stats` · `GET /audit-logs`

Full machine-readable spec at `/docs` (OpenAPI / Swagger UI) once the stack is running.

## Production checklist

- [ ] Replace `JWT_SECRET_KEY` in `backend/.env` with at least 64 random chars.
- [ ] Replace seeded admin password (`admin@ukwi.rw / ChangeMe!2026`).
- [ ] Replace `DB_PASSWORD` and `DB_ROOT_PASSWORD` in `backend/.env`.
- [ ] Front the stack with HTTPS (Caddy or `certbot`).
- [ ] Mount `mysql_data`, `upload_data`, `report_data` volumes on durable storage; run nightly snapshots.
- [ ] Wire SMTP for password-reset emails.
- [ ] Train the CNN and ship a `basketball_court_cnn.h5` so `using_fallback` is false in production.
- [ ] Move long-running AI retraining onto a Celery + Redis worker.

## License

Internal — UKWI Company Ltd.

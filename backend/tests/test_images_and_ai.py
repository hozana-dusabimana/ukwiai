def _make_project(client, headers):
    r = client.post("/api/projects", headers=headers, json={
        "project_name": "Court C", "project_code": "KGL-C",
        "court_type": "outdoor", "total_budget": "1000000.00",
    })
    return r.json()


def test_upload_image_and_analyze(client, auth_headers, png_bytes):
    p = _make_project(client, auth_headers)
    files = {"file": ("test.png", png_bytes, "image/png")}
    r = client.post(f"/api/projects/{p['id']}/images/upload", headers=auth_headers, files=files)
    assert r.status_code == 201, r.text
    img = r.json()

    # Analyze that image — uses fake AI client from conftest
    r = client.post("/api/ai/analyze-image", headers=auth_headers, data={"image_id": str(img["id"])})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["analysis"]["predicted_stage"]
    assert body["cost_estimation_id"] is not None


def test_invalid_image_rejected(client, auth_headers):
    p = _make_project(client, auth_headers)
    files = {"file": ("test.png", b"not an image", "image/png")}
    r = client.post(f"/api/projects/{p['id']}/images/upload", headers=auth_headers, files=files)
    assert r.status_code == 400


def test_site_background_sets_terrain(client, auth_headers, png_bytes):
    """Uploading the site background assesses terrain and stores the multiplier."""
    p = _make_project(client, auth_headers)
    files = {"file": ("plot.png", png_bytes, "image/png")}
    r = client.post(f"/api/projects/{p['id']}/site-background", headers=auth_headers, files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert float(body["terrain_difficulty"]) == 1.25  # from fake assess_terrain
    assert body["terrain_assessment"]["difficulty_label"] == "hard"
    # and it is now readable on the project
    pr = client.get(f"/api/projects/{p['id']}", headers=auth_headers).json()
    assert float(pr["terrain_difficulty"]) == 1.25


def test_predicted_cost_can_exceed_budget(client, auth_headers, png_bytes):
    """The market-priced prediction is independent of the plan and can exceed it."""
    # Tiny budget so the market bill obviously overruns the per-stage allocation.
    p = _make_project(client, auth_headers)  # budget = 1,000,000
    img = client.post(
        f"/api/projects/{p['id']}/images/upload", headers=auth_headers,
        files={"file": ("court.png", png_bytes, "image/png")},
    ).json()
    r = client.post("/api/ai/analyze-image", headers=auth_headers, data={"image_id": str(img["id"])})
    assert r.status_code == 200, r.text
    body = r.json()
    # Response carries the material-aware, market-priced prediction.
    assert body["cost_prediction"]["currency"] == "RWF"
    assert body["materials_visible"]
    assert body["predicted_stage_cost"]["total"] > 0

    # The breakdown's predicted spend for stage 1 exceeds its small allocation.
    bd = client.get(f"/api/projects/{p['id']}/budget/breakdown", headers=auth_headers).json()
    stage1 = next(row for row in bd if "Clearing" in row["stage_name"])
    assert stage1["ai_predicted_cost"] > stage1["allocated_budget"]
    assert stage1["over_budget"] is True

    # Summary surfaces the predicted total and it drives the effective spend.
    summ = client.get(f"/api/projects/{p['id']}/budget/summary", headers=auth_headers).json()
    assert float(summ["total_ai_predicted_cost"]) > 0
    assert float(summ["effective_total_spent"]) == float(summ["total_ai_predicted_cost"])


def test_volleyball_structure_rejected(client, auth_headers, png_bytes, monkeypatch):
    """Guard 1b: the AI detects volleyball structures → 422, nothing persisted."""
    from app.api.v1 import ai as ai_router_module

    p = _make_project(client, auth_headers)

    async def fake_predict(image_bytes, filename="image.jpg", **kwargs):
        return {
            "predicted_stage": "Hoops & Backboards Installation",
            "predicted_progress": 85.0,
            "confidence": 0.8,
            "is_basketball_court": True,
            "structure_sport": "volleyball",
            "model_version": "test-1.0",
            "raw_predictions": {},
        }

    monkeypatch.setattr(ai_router_module.ai_client, "predict", fake_predict)
    files = {"file": ("vb.png", png_bytes, "image/png")}
    r = client.post(
        "/api/ai/analyze-image", headers=auth_headers,
        data={"project_id": str(p["id"])}, files=files,
    )
    assert r.status_code == 422, r.text
    assert "volleyball" in r.json()["detail"].lower()


def test_volleyball_sized_court_warns_but_analyses(client, auth_headers, png_bytes, monkeypatch):
    """A volleyball-sized footprint (18×9) is a soft warning, not a hard reject —
    the photo still analyses, but the response flags the wrong-sport measurement."""
    from app.api.v1 import ai as ai_router_module

    r = client.post("/api/projects", headers=auth_headers, json={
        "project_name": "VB-sized", "project_code": "KGL-VB",
        "court_type": "outdoor", "court_dimensions": "18x9", "total_budget": "1000000.00",
    })
    p = r.json()

    async def fake_predict(image_bytes, filename="image.jpg", **kwargs):
        return {
            "predicted_stage": "Site Clearing & Excavation",
            "predicted_progress": 5.0,
            "confidence": 0.5,
            "is_basketball_court": True,
            "structure_sport": "unknown",
            "model_version": "test-1.0",
            "raw_predictions": {},
        }

    monkeypatch.setattr(ai_router_module.ai_client, "predict", fake_predict)
    files = {"file": ("early.png", png_bytes, "image/png")}
    r = client.post(
        "/api/ai/analyze-image", headers=auth_headers,
        data={"project_id": str(p["id"])}, files=files,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["court_measurement"]["sport_by_measurement"] == "volleyball"
    assert body["sport_warning"] and "volleyball" in body["sport_warning"].lower()


def test_court_measurement_classifier():
    """Footprint-only sport classification — works with no image at all."""
    from app.services.cost_estimation import classify_court_sport
    assert classify_court_sport("28x15")[0] == "basketball"
    assert classify_court_sport("18x9")[0] == "volleyball"
    assert classify_court_sport(None) == ("basketball", "assumed",
        "No court dimensions recorded — assuming a standard basketball court.")


def test_predict_stage_stateless(client, auth_headers, png_bytes):
    files = {"file": ("test.png", png_bytes, "image/png")}
    r = client.post("/api/ai/predict-stage", headers=auth_headers, files=files)
    assert r.status_code == 200
    assert "predicted_stage" in r.json()


def test_non_basketball_image_rejected(client, auth_headers, png_bytes, monkeypatch):
    """Guard 1: the AI flags is_basketball_court=False → 422, nothing persisted."""
    from app.api.v1 import ai as ai_router_module

    p = _make_project(client, auth_headers)

    async def fake_predict(image_bytes, filename="image.jpg", **kwargs):
        return {
            "predicted_stage": "Site Clearing & Excavation",
            "predicted_progress": 5.0,
            "confidence": 0.3,
            "is_basketball_court": False,
            "model_version": "test-1.0",
            "raw_predictions": {},
        }

    monkeypatch.setattr(ai_router_module.ai_client, "predict", fake_predict)

    files = {"file": ("not-a-court.png", png_bytes, "image/png")}
    r = client.post(
        "/api/ai/analyze-image", headers=auth_headers,
        data={"project_id": str(p["id"])}, files=files,
    )
    assert r.status_code == 422, r.text
    assert "basketball" in r.json()["detail"].lower()


def test_completed_stage_rejected(client, auth_headers, db_session, png_bytes, monkeypatch):
    """Guard 2: predicted stage already completed → 409 friendly message."""
    from sqlalchemy import select
    from app.api.v1 import ai as ai_router_module
    from app.models.stage import ProjectStage, ConstructionStage, ProjectStageStatus

    p = _make_project(client, auth_headers)

    # Mark stage 1 as already completed for this project.
    row = db_session.execute(
        select(ProjectStage)
        .join(ConstructionStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(ProjectStage.project_id == p["id"], ConstructionStage.stage_order == 1)
    ).scalar_one()
    row.status = ProjectStageStatus.completed
    db_session.commit()

    async def fake_predict(image_bytes, filename="image.jpg", **kwargs):
        return {
            "predicted_stage": "Site Clearing & Excavation",
            "predicted_progress": 5.0,
            "confidence": 0.9,
            "is_basketball_court": True,
            "model_version": "test-1.0",
            "raw_predictions": {},
        }

    monkeypatch.setattr(ai_router_module.ai_client, "predict", fake_predict)

    files = {"file": ("court.png", png_bytes, "image/png")}
    r = client.post(
        "/api/ai/analyze-image", headers=auth_headers,
        data={"project_id": str(p["id"])}, files=files,
    )
    assert r.status_code == 409, r.text
    assert "completed" in r.json()["detail"].lower()

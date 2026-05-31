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


def test_predict_stage_stateless(client, auth_headers, png_bytes):
    files = {"file": ("test.png", png_bytes, "image/png")}
    r = client.post("/api/ai/predict-stage", headers=auth_headers, files=files)
    assert r.status_code == 200
    assert "predicted_stage" in r.json()


def test_non_basketball_image_rejected(client, auth_headers, png_bytes, monkeypatch):
    """Guard 1: the AI flags is_basketball_court=False → 422, nothing persisted."""
    from app.api.v1 import ai as ai_router_module

    p = _make_project(client, auth_headers)

    async def fake_predict(image_bytes, filename="image.jpg"):
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

    async def fake_predict(image_bytes, filename="image.jpg"):
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

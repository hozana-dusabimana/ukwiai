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

def _make_project(client, headers):
    r = client.post("/api/projects", headers=headers, json={
        "project_name": "Kigali Court A",
        "project_code": "KGL-A",
        "location": "Kigali",
        "client_name": "City of Kigali",
        "court_type": "outdoor",
        "court_dimensions": "28m x 15m",
        "start_date": "2026-01-15",
        "expected_end_date": "2026-04-30",
        "total_budget": "50000000.00",
        "description": "Outdoor basketball court",
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_create_and_list_projects(client, auth_headers):
    p = _make_project(client, auth_headers)
    assert p["project_code"] == "KGL-A"
    r = client.get("/api/projects", headers=auth_headers)
    assert r.status_code == 200
    assert any(x["id"] == p["id"] for x in r.json())


def test_duplicate_code_rejected(client, auth_headers):
    _make_project(client, auth_headers)
    r = client.post("/api/projects", headers=auth_headers, json={
        "project_name": "Dup", "project_code": "KGL-A", "total_budget": "1.00",
    })
    assert r.status_code == 409


def test_project_auto_creates_seven_stages(client, auth_headers, db_session):
    p = _make_project(client, auth_headers)
    r = client.get(f"/api/projects/{p['id']}/timeline", headers=auth_headers)
    assert r.status_code == 200
    timeline = r.json()
    assert len(timeline) == 7
    # Allocation per stage matches expected_cost_percentage
    total = sum(s["allocated_budget"] for s in timeline)
    assert abs(total - 50000000.0) < 1.0


def test_project_status_change(client, auth_headers):
    p = _make_project(client, auth_headers)
    r = client.patch(f"/api/projects/{p['id']}/status", headers=auth_headers, json={"status": "ongoing"})
    assert r.status_code == 200 and r.json()["status"] == "ongoing"


def test_project_summary(client, auth_headers):
    p = _make_project(client, auth_headers)
    r = client.get(f"/api/projects/{p['id']}/summary", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["project"]["id"] == p["id"]
    assert body["images_count"] == 0

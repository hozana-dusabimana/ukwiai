from decimal import Decimal


def _create(client, headers, budget="20000000"):
    r = client.post("/api/projects", headers=headers, json={
        "project_name": "Court B", "project_code": "KGL-B",
        "court_type": "outdoor", "total_budget": budget,
    })
    assert r.status_code == 201
    return r.json()


def test_add_expense_and_summary(client, auth_headers):
    p = _create(client, auth_headers, "10000000")
    r = client.post(f"/api/projects/{p['id']}/budget/expense", headers=auth_headers, json={
        "expense_category": "materials", "amount": "1500000.00",
        "description": "Cement and rebar", "expense_date": "2026-02-01",
    })
    assert r.status_code == 201, r.text

    r = client.get(f"/api/projects/{p['id']}/budget/summary", headers=auth_headers)
    body = r.json()
    assert float(body["total_spent"]) == 1500000.0
    assert float(body["remaining"]) == 8500000.0
    assert "materials" in body["by_category"]


def test_cost_estimation_under_track_over(client, auth_headers, db_session):
    """Cost estimation rules: variance threshold = 5%."""
    p = _create(client, auth_headers, "10000000")

    # Manually run cost estimation with synthetic progress.
    from app.services.cost_estimation import compute_cost_estimation
    from app.models.project import Project

    proj = db_session.get(Project, p["id"])
    e = compute_cost_estimation(db_session, proj, predicted_progress=50, persist=False)
    # No expenses => variance = -estimated = -5,000,000 (-50% of budget) => "under"
    assert e.deviation_status.value == "under"
    assert float(e.estimated_cost_used) == 5000000.0


def test_variance_history_endpoint(client, auth_headers):
    p = _create(client, auth_headers)
    r = client.post(f"/api/projects/{p['id']}/estimate-cost", headers=auth_headers)
    assert r.status_code == 200
    r = client.get(f"/api/projects/{p['id']}/variance-analysis", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

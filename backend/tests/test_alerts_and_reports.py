def _make_project(client, headers):
    r = client.post("/api/projects", headers=headers, json={
        "project_name": "Court D", "project_code": "KGL-D",
        "court_type": "outdoor", "total_budget": "5000000.00",
    })
    return r.json()


def test_alerts_listing_empty(client, auth_headers):
    r = client.get("/api/alerts", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_full_report_generation(client, auth_headers):
    p = _make_project(client, auth_headers)
    # Add an expense so the report has something to render
    client.post(f"/api/projects/{p['id']}/budget/expense", headers=auth_headers, json={
        "expense_category": "labor", "amount": "300000.00",
        "description": "Crew week 1", "expense_date": "2026-02-15",
    })
    r = client.post(f"/api/projects/{p['id']}/reports/full", headers=auth_headers)
    assert r.status_code == 201, r.text
    rep = r.json()
    # Download
    r = client.get(f"/api/reports/{rep['id']}/download", headers=auth_headers)
    assert r.status_code == 200
    # PDF magic bytes
    assert r.content[:4] == b"%PDF"


def test_excel_budget_report(client, auth_headers):
    p = _make_project(client, auth_headers)
    r = client.post(f"/api/projects/{p['id']}/reports/budget?fmt=excel", headers=auth_headers)
    assert r.status_code == 201
    r = client.get(f"/api/reports/{r.json()['id']}/download", headers=auth_headers)
    assert r.status_code == 200
    # XLSX is a ZIP
    assert r.content[:2] == b"PK"

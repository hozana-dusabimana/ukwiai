def test_dashboard_overview_empty(client, auth_headers):
    r = client.get("/api/dashboard/overview", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_projects"] == 0
    assert body["active_projects"] == 0


def test_system_health(client, auth_headers):
    r = client.get("/api/system/health", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["database"] == "ok"


def test_admin_only_user_listing(client, manager_headers):
    r = client.get("/api/users", headers=manager_headers)
    assert r.status_code == 403


def test_admin_can_list_users(client, auth_headers):
    r = client.get("/api/users", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_audit_logs_admin_only(client, manager_headers, auth_headers):
    assert client.get("/api/audit-logs", headers=manager_headers).status_code == 403
    assert client.get("/api/audit-logs", headers=auth_headers).status_code == 200

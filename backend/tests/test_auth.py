def test_register_login_me(client):
    r = client.post("/api/auth/register", json={
        "full_name": "John Doe",
        "email": "john@test.example.com",
        "password": "Test12345!",
    })
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "john@test.example.com"

    r = client.post("/api/auth/login", data={"username": "john@test.example.com", "password": "Test12345!"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert token

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "john@test.example.com"


def test_login_with_wrong_password(client, admin_user):
    r = client.post("/api/auth/login", data={"username": admin_user.email, "password": "wrong"})
    assert r.status_code == 401


def test_protected_endpoint_without_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_change_password(client, admin_user, auth_headers):
    r = client.put("/api/auth/change-password", headers=auth_headers, json={
        "current_password": "Test12345!", "new_password": "NewSecret9!",
    })
    assert r.status_code == 200
    # Old password should no longer work
    r = client.post("/api/auth/login", data={"username": admin_user.email, "password": "Test12345!"})
    assert r.status_code == 401
    r = client.post("/api/auth/login", data={"username": admin_user.email, "password": "NewSecret9!"})
    assert r.status_code == 200


def test_refresh_token(client, admin_user):
    r = client.post("/api/auth/login", data={"username": admin_user.email, "password": "Test12345!"})
    refresh = r.json()["refresh_token"]
    r = client.post("/api/auth/refresh-token", json={"refresh_token": refresh})
    assert r.status_code == 200
    assert r.json()["access_token"]

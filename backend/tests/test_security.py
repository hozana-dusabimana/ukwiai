from app.core.security import hash_password, verify_password, create_access_token, decode_token


def test_password_hashing_roundtrip():
    h = hash_password("MyStrong!Pwd1")
    assert h != "MyStrong!Pwd1"
    assert verify_password("MyStrong!Pwd1", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip():
    token = create_access_token(42, role="admin")
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"
    assert payload["role"] == "admin"

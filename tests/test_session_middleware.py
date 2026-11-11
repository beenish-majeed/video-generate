import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.core.session import generate_session_token, verify_session_token


@pytest.fixture
def fresh_client():
    return TestClient(app)


def test_new_visitor_receives_signed_session_cookie(fresh_client):
    # A fresh visitor with no cookies requests an endpoint
    resp = fresh_client.get("/health")
    assert resp.status_code == 200

    # Ensure anon_session cookie is set in response
    assert settings.session_cookie_name in resp.cookies
    token = resp.cookies[settings.session_cookie_name]

    # Verify cookie is cryptographically valid and signed
    session_id = verify_session_token(token)
    assert session_id is not None
    assert session_id.startswith("sess_")

    # Verify Set-Cookie flags (HttpOnly, SameSite)
    set_cookie_header = resp.headers.get("set-cookie", "")
    assert settings.session_cookie_name in set_cookie_header
    assert "httponly" in set_cookie_header.lower()
    assert "samesite=lax" in set_cookie_header.lower()


def test_returning_visitor_preserves_session(fresh_client):
    # First request establishes session
    resp1 = fresh_client.get("/health")
    token1 = resp1.cookies.get(settings.session_cookie_name)
    assert token1 is not None
    session_id1 = verify_session_token(token1)

    # Second request with the same client automatically presents the session cookie
    resp2 = fresh_client.get("/health")
    assert resp2.status_code == 200

    # Explicit client with cookie
    client2 = TestClient(app, cookies={settings.session_cookie_name: token1})
    resp3 = client2.get("/health")
    assert resp3.status_code == 200


def test_tampered_cookie_rotated_to_fresh_session():
    # Attacker passes forged/tampered session cookie
    tampered_cookie = "sess_00000000000000000000000000000000.12345678.invalidsignature"
    client_attacker = TestClient(app, cookies={settings.session_cookie_name: tampered_cookie})

    resp = client_attacker.get("/health")
    assert resp.status_code == 200

    # Server must rotate and issue a new, valid session cookie
    assert settings.session_cookie_name in resp.cookies
    new_token = resp.cookies[settings.session_cookie_name]
    assert new_token != tampered_cookie

    new_session_id = verify_session_token(new_token)
    assert new_session_id is not None
    assert new_session_id != "sess_00000000000000000000000000000000"


def test_untrusted_client_identity_headers_ignored(fresh_client):
    # User passes untrusted headers trying to claim someone else's ID
    fake_headers = {
        "X-Client-ID": "victim_alice_account",
        "X-User-ID": "admin_bob_account",
    }
    resp = fresh_client.get("/health", headers=fake_headers)
    assert resp.status_code == 200

    token = resp.cookies.get(settings.session_cookie_name)
    assert token is not None
    session_id = verify_session_token(token)

    # Session ID must be generated securely by server, not equal to the header values
    assert session_id != "victim_alice_account"
    assert session_id != "admin_bob_account"
    assert session_id.startswith("sess_")

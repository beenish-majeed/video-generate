import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.core.session import _get_signing_key, verify_session_token


def test_secure_cookie_behind_https_reverse_proxy():
    client = TestClient(app)

    # 1. Standard HTTPS proxy header X-Forwarded-Proto
    resp = client.get("/health", headers={"X-Forwarded-Proto": "https"})
    assert resp.status_code == 200
    set_cookie = resp.headers.get("set-cookie", "")
    assert settings.session_cookie_name in set_cookie
    assert "secure" in set_cookie.lower(), "Cookie must have Secure flag when X-Forwarded-Proto is https"
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()

    # 2. RFC 7239 standard Forwarded header
    client_fwd = TestClient(app)
    resp_fwd = client_fwd.get("/health", headers={"Forwarded": "proto=https;for=203.0.113.195"})
    assert resp_fwd.status_code == 200
    set_cookie_fwd = resp_fwd.headers.get("set-cookie", "")
    assert "secure" in set_cookie_fwd.lower(), "Cookie must have Secure flag when Forwarded proto=https"

    # 3. Direct HTTPS request
    client_https = TestClient(app, base_url="https://testserver")
    resp_https = client_https.get("/health")
    assert resp_https.status_code == 200
    set_cookie_https = resp_https.headers.get("set-cookie", "")
    assert "secure" in set_cookie_https.lower(), "Cookie must have Secure flag when URL scheme is https"


def test_persistent_session_secret(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    monkeypatch.setattr(settings, "session_secret", "")

    # Reset any cached key
    import src.core.session as session_mod
    monkeypatch.setattr(session_mod, "_CACHED_SECRET_KEY", None)

    key1 = _get_signing_key()
    assert len(key1) >= 32

    # Secret file was created on disk
    secret_file = tmp_path / ".session_secret"
    assert secret_file.exists()
    saved_raw = secret_file.read_text().strip()
    assert key1.decode("utf-8") == saved_raw

    # Simulate process restart by clearing cached memory
    monkeypatch.setattr(session_mod, "_CACHED_SECRET_KEY", None)
    key2 = _get_signing_key()
    assert key1 == key2, "Session secret key must persist across server restarts"

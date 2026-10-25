import pytest
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app, lifespan

client = TestClient(app)

SECURE_TEST_KEY = "test_cryptographic_secret_key_123456"


def test_api_auth_insecure_dev_mode(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)
    response = client.get("/v1/jobs")
    assert response.status_code == 200


def test_api_auth_missing_key_header_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs")
    assert response.status_code == 401
    assert "Invalid or missing API key" in response.json()["detail"]


def test_api_auth_wrong_key_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs", headers={"X-API-Key": "wrong_key_xyz"})
    assert response.status_code == 401
    assert "Invalid or missing API key" in response.json()["detail"]


def test_api_auth_correct_key_header_returns_200(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs", headers={"X-API-Key": SECURE_TEST_KEY})
    assert response.status_code == 200


def test_api_auth_query_string_key_is_rejected(monkeypatch):
    """Verify that passing api_key in query string is no longer accepted (header only)."""
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get(f"/v1/jobs?api_key={SECURE_TEST_KEY}")
    assert response.status_code == 401
    assert "Invalid or missing API key" in response.json()["detail"]


def test_health_endpoint_returns_minimal_ok():
    """Verify /health returns minimal {'ok': True} without exposing filesystem paths."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.anyio
async def test_startup_refuses_when_no_key_and_no_dev_flag(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(app):
            pass
    assert "CRITICAL SECURITY RISK" in str(exc_info.value)


@pytest.mark.anyio
async def test_startup_refuses_placeholder_keys(monkeypatch):
    """Verify startup refuses known placeholders."""
    for placeholder in ["your_secret_api_key_here", "change_me", "dev_key_123"]:
        monkeypatch.setattr(settings, "api_key", placeholder)
        monkeypatch.setattr(settings, "allow_insecure_dev", False)

        with pytest.raises(RuntimeError) as exc_info:
            async with lifespan(app):
                pass
        assert "insecure placeholder" in str(exc_info.value).lower()


@pytest.mark.anyio
async def test_startup_refuses_keys_under_16_chars(monkeypatch):
    """Verify startup refuses keys shorter than 16 characters."""
    monkeypatch.setattr(settings, "api_key", "short_key_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(app):
            pass
    assert "too short" in str(exc_info.value).lower()


@pytest.mark.anyio
async def test_startup_succeeds_with_strong_key(monkeypatch):
    """Verify startup succeeds with random 16+ char key."""
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    async with lifespan(app):
        pass

import pytest
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app, lifespan

client = TestClient(app)


def test_api_auth_insecure_dev_mode(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)
    response = client.get("/v1/jobs")
    assert response.status_code == 200


def test_api_auth_missing_key_header_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "secret_key_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs")
    assert response.status_code == 401
    assert "Invalid or missing API key" in response.json()["detail"]


def test_api_auth_wrong_key_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "secret_key_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs", headers={"X-API-Key": "wrong_key_xyz"})
    assert response.status_code == 401
    assert "Invalid or missing API key" in response.json()["detail"]


def test_api_auth_correct_key_header_returns_200(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "secret_key_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs", headers={"X-API-Key": "secret_key_123"})
    assert response.status_code == 200


def test_api_auth_unconfigured_key_without_dev_flag_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    response = client.get("/v1/jobs")
    assert response.status_code == 401
    assert "Authentication failed: API key is not configured" in response.json()["detail"]


@pytest.mark.anyio
async def test_startup_refuses_when_no_key_and_no_dev_flag(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(app):
            pass
    assert "CRITICAL SECURITY RISK" in str(exc_info.value)

from fastapi.testclient import TestClient
from src.config import settings
from src.main import app

client = TestClient(app)


def test_api_auth_disabled_when_no_key(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    response = client.get("/health")
    assert response.status_code == 200


def test_api_auth_enforced_when_key_set(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "secret_test_key")

    # Unauthorized request without key
    response = client.get("/v1/jobs")
    assert response.status_code == 401

    # Authorized request with X-API-Key header
    response = client.get("/v1/jobs", headers={"X-API-Key": "secret_test_key"})
    assert response.status_code == 200

    # Authorized request with query param
    response = client.get("/v1/jobs?api_key=secret_test_key")
    assert response.status_code == 200

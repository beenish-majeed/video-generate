import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings


def test_no_redirect_in_default_dev_mode():
    """Default mode must allow plain HTTP without redirection for local development."""
    assert settings.enforce_https is False
    client = TestClient(app)
    resp = client.get("/health", follow_redirects=False)
    assert resp.status_code == 200


def test_https_redirect_when_enforced(monkeypatch):
    """When enforce_https is True, plain HTTP requests must be redirected to HTTPS."""
    monkeypatch.setattr(settings, "enforce_https", True)
    client = TestClient(app)

    resp = client.get("/health", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"].startswith("https://")


def test_no_redirect_and_hsts_when_proxy_forwards_https(monkeypatch):
    """When proxy forwards HTTPS (X-Forwarded-Proto: https), no redirect occurs and HSTS is set."""
    monkeypatch.setattr(settings, "enforce_https", True)
    client = TestClient(app)

    resp = client.get("/health", headers={"X-Forwarded-Proto": "https"}, follow_redirects=False)
    assert resp.status_code == 200
    assert "strict-transport-security" in resp.headers
    assert "max-age=" in resp.headers["strict-transport-security"]


def test_rfc7239_forwarded_proto_https_accepted(monkeypatch):
    """RFC 7239 Forwarded: proto=https must satisfy HTTPS enforcement without redirect."""
    monkeypatch.setattr(settings, "enforce_https", True)
    client = TestClient(app)

    resp = client.get(
        "/health",
        headers={"Forwarded": "proto=https;for=203.0.113.195"},
        follow_redirects=False,
    )
    assert resp.status_code == 200
    assert "strict-transport-security" in resp.headers

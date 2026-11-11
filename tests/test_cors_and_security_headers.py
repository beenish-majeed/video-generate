import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_cors_preflight_allowed_origin():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "GET" in response.headers.get("access-control-allow-methods", "")


def test_cors_disallowed_origin_rejected():
    response = client.options(
        "/health",
        headers={
            "Origin": "https://malicious-attacker-domain.evil",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Disallowed origins do not receive access-control-allow-origin header
    assert response.headers.get("access-control-allow-origin") is None


def test_security_headers_present_on_api_responses():
    response = client.get("/health")
    assert response.status_code == 200
    headers = response.headers

    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Referrer-Policy") == "no-referrer"
    assert "accelerometer=()" in headers.get("Permissions-Policy", "")
    assert "default-src 'none'" in headers.get("Content-Security-Policy", "")

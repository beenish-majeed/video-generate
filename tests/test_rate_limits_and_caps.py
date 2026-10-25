import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.utils.rate_limiter import BoundedSlidingWindowLimiter

client = TestClient(app)
SECURE_KEY = "test_cryptographic_secret_key_123456"


def test_bounded_rate_limiter_evicts_old_keys():
    """Verify that limiter stays strictly bounded to max_keys."""
    limiter = BoundedSlidingWindowLimiter(max_requests=5, window_seconds=10.0, max_keys=10)

    # Add 25 different IPs
    for i in range(25):
        limiter.check(f"192.168.1.{i}")

    # Ensure internal dict never grew past max_keys
    assert len(limiter._history) <= 10


def test_bounded_rate_limiter_raises_429():
    """Verify rate limiter raises 429 when limit is reached."""
    limiter = BoundedSlidingWindowLimiter(max_requests=3, window_seconds=60.0, name="test")

    # 3 requests pass
    limiter.check("client_a")
    limiter.check("client_a")
    limiter.check("client_a")

    # 4th request raises 429
    with pytest.raises(HTTPException) as exc_info:
        limiter.check("client_a")
    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail


def test_job_capacity_cap_returns_503(monkeypatch):
    """Verify that job creation returns 503 when concurrent/queued job cap is reached."""
    monkeypatch.setattr(settings, "api_key", SECURE_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    # Mock active jobs count to reach or exceed cap
    monkeypatch.setattr("src.main.count_active_jobs", lambda: 16)
    monkeypatch.setattr(settings, "max_active_jobs_cap", 16)

    payload = {
        "avatar_preset_id": "avatar_default",
        "voice_preset_id": "voice_piper_lessac",
        "prompt": "5 second video",
        "consent": {
            "authorized": True,
            "statement": "I authorize this video generation and own all explicit rights.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
            "ai_generated_accepted": True,
            "ai_label_accepted": True,
        },
    }

    resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": SECURE_KEY})
    assert resp.status_code == 503
    assert "Server busy: maximum capacity" in resp.json()["detail"]

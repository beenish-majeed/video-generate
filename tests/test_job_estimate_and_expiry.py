from datetime import timedelta
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import create_job

client = TestClient(app)
API_KEY = "test_key_estimate_12345"


@pytest.fixture(autouse=True)
def setup_api_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def test_job_estimate_endpoint_talking_head():
    payload = {
        "target_duration_seconds": 30.0,
        "visual_mode": "talking_head",
    }
    resp = client.post("/v1/jobs/estimate", json=payload, headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    data = resp.json()
    assert data["target_duration_seconds"] == 30.0
    assert data["visual_mode"] == "talking_head"
    assert data["estimated_render_seconds"] == 81.0
    assert "1 min 21 sec" in data["estimated_render_human"]
    assert "CPU" in data["compute_advisory"]
    assert data["retention_policy_hours"] == 48.0
    assert "not cloned" in data["voice_cloning_note"]


def test_job_estimate_endpoint_slideshow():
    payload = {
        "target_duration_seconds": 60.0,
        "visual_mode": "slideshow",
    }
    resp = client.post("/v1/jobs/estimate", json=payload, headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    data = resp.json()
    assert data["target_duration_seconds"] == 60.0
    assert data["visual_mode"] == "slideshow"
    assert data["estimated_render_seconds"] == 51.0
    assert data["retention_policy_hours"] == 48.0


def test_create_job_records_render_estimate_and_expiry():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this generation.",
        ai_generated_accepted=True,
    )
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Hello world, this is a longer valid test script to satisfy duration limits.",
        target_duration_seconds=5.0,
        visual_mode="talking_head",
        consent=consent,
    )
    job = create_job(req)
    assert job.estimated_render_seconds is not None
    assert job.estimated_render_seconds == pytest.approx(13.5, abs=0.5)
    assert job.retention_expires_at is not None
    diff_hours = (job.retention_expires_at - job.created_at).total_seconds() / 3600.0
    assert pytest.approx(diff_hours, abs=0.1) == 48.0
    assert "not cloned" in job.voice_cloning_disclaimer

import pytest
from fastapi.testclient import TestClient
from pathlib import Path

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate, JobState
from src.services.capabilities import compute_honest_time_estimate, get_system_capabilities
from src.services.jobs import cancel_job, create_job, get_job, save_job_record

TEST_API_KEY = "test_key_123"


@pytest.fixture(autouse=True)
def setup_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", TEST_API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


@pytest.fixture
def client():
    return TestClient(app)


def test_capabilities_endpoint(client):
    headers = {"X-API-Key": TEST_API_KEY}
    resp = client.get("/v1/capabilities", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "gpu" in data
    assert "available" in data["gpu"]
    assert "providers" in data
    assert "ollama" in data["providers"]
    assert "diffusers" in data["providers"]
    assert "whisper" in data["providers"]
    assert "piper" in data["providers"]
    assert "cards" in data["providers"]
    assert "auto_subtitles" in data
    assert "background_music" in data
    assert data["background_music"] is True


def test_capabilities_with_duration_estimate(client):
    headers = {"X-API-Key": TEST_API_KEY}
    resp = client.get("/v1/capabilities?duration_seconds=30&mode=slideshow", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "estimate" in data
    assert data["estimate"]["estimated_seconds"] > 0
    assert "display_text" in data["estimate"]
    assert "%" not in data["estimate"]["display_text"]


def test_honest_time_estimate_never_fake_percentages():
    est_gpu = compute_honest_time_estimate(duration_seconds=30, mode="slideshow", gpu=True)
    assert "%" not in est_gpu["display_text"]
    assert est_gpu["estimated_seconds"] > 0

    est_cpu = compute_honest_time_estimate(duration_seconds=60, mode="talking_head", gpu=False)
    assert "%" not in est_cpu["display_text"]
    assert est_cpu["estimated_seconds"] >= 60


def test_cancel_non_existent_job(client):
    headers = {"X-API-Key": TEST_API_KEY}
    resp = client.post("/v1/jobs/job_nonexistent_999/cancel", headers=headers)
    assert resp.status_code == 404


def test_cancel_active_job(client, tmp_path):
    # Setup test assets
    from src.services import store
    orig_assets_dir = store.ASSETS_DIR
    store.ASSETS_DIR = tmp_path / "assets"
    store.ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from tests.test_my_own_mode import make_test_image
        img_id = "cancel_test_img"
        make_test_image(store.ASSETS_DIR / f"{img_id}.png")

        consent = ConsentRequest(
            authorized=True,
            ai_generated_accepted=True,
            ai_label_accepted=True,
            statement="I accept this AI generated video and label.",
        )

        req = JobCreate(
            uploaded_image_asset_ids=[img_id],
            script="This is a test script for testing job cancellation.",
            consent=consent,
        )
        job = create_job(req)
        assert job.state == JobState.CONSENT_VERIFIED

        # Call cancel endpoint
        headers = {"X-API-Key": TEST_API_KEY}
        resp = client.post(f"/v1/jobs/{job.job_id}/cancel", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == JobState.CANCELLED.value
        assert "cancelled" in data["error"].lower()

        # Check DB load
        reloaded = get_job(job.job_id)
        assert reloaded is not None
        assert reloaded.state == JobState.CANCELLED

    finally:
        store.ASSETS_DIR = orig_assets_dir

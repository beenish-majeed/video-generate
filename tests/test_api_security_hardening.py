import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from src.main import app
from src.core.config import settings

client = TestClient(app)
API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_api_key(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def test_job_id_path_traversal_blocked():
    headers = {"X-API-Key": API_KEY}
    malicious_ids = [
        "..traversal",
        "job..traversal",
        "nested/path",
        "job!@#$%",
        "job space id",
        "job;drop table;",
    ]

    for bad_id in malicious_ids:
        # GET /v1/jobs/{job_id}
        resp = client.get(f"/v1/jobs/{bad_id}", headers=headers)
        assert resp.status_code in {400, 404, 405}
        if resp.status_code == 400:
            assert "Invalid job identifier" in resp.text

        # POST /v1/jobs/{job_id}/cancel
        resp_c = client.post(f"/v1/jobs/{bad_id}/cancel", headers=headers)
        assert resp_c.status_code in {400, 404, 405}
        if resp_c.status_code == 400:
            assert "Invalid job identifier" in resp_c.text

        # GET /v1/jobs/{job_id}/download
        resp_d = client.get(f"/v1/jobs/{bad_id}/download", headers=headers)
        assert resp_d.status_code in {400, 404, 405}
        if resp_d.status_code == 400:
            assert "Invalid job identifier" in resp_d.text

        # DELETE /v1/jobs/{job_id}
        resp_del = client.delete(f"/v1/jobs/{bad_id}", headers=headers)
        assert resp_del.status_code in {400, 404, 405}
        if resp_del.status_code == 400:
            assert "Invalid job identifier" in resp_del.text


def test_asset_upload_does_not_leak_internal_filesystem_path():
    headers = {"X-API-Key": API_KEY}
    img = Image.new("RGB", (64, 64), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    resp = client.post(
        "/v1/assets/upload",
        headers=headers,
        data={"kind": "photo"},
        files={"file": ("test_pic.jpg", buf, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "asset_id" in data
    assert data["asset_id"].startswith("photo_")
    assert "sha256" in data
    # Ensure internal filesystem path is NOT leaked in API response
    assert "path" not in data


def test_estimate_endpoint_rate_limited(monkeypatch):
    from src.utils.rate_limiter import SCRIPT_LIMITER
    headers = {"X-API-Key": API_KEY}

    payload = {
        "visual_mode": "text_to_video",
        "target_duration_seconds": 15.0,
    }

    # Reset limiter for test IP
    SCRIPT_LIMITER._history.clear()

    # SCRIPT_LIMITER allows max_requests (e.g. 30 requests)
    for _ in range(SCRIPT_LIMITER.max_requests):
        resp = client.post("/v1/jobs/estimate", json=payload, headers=headers)
        assert resp.status_code == 200

    # Next call must be blocked with 429
    resp_blocked = client.post("/v1/jobs/estimate", json=payload, headers=headers)
    assert resp_blocked.status_code == 429
    assert "Rate limit exceeded" in resp_blocked.json()["detail"]

    # Clear after test so subsequent tests are unaffected
    SCRIPT_LIMITER._history.clear()

import pytest
import time
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.core.session import generate_session_token
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import save_job_record, load_job_record

API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def test_download_isolated_by_session():
    # 1. Setup completed job for Visitor A
    token_a, session_id_a = generate_session_token()
    job_id = "job_session_dl_test_01"

    out_dir = settings.storage_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{job_id}.mp4"
    out_file.write_bytes(b"session_isolated_mp4_bytes")

    job = JobRecord(
        job_id=job_id,
        session_id=session_id_a,
        state=JobState.COMPLETED,
        output_path=str(out_file),
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Ocean documentary",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    try:
        # 2. Visitor B attempts to download Visitor A's video -> 403 Forbidden
        token_b, session_id_b = generate_session_token()
        client_b = TestClient(app, cookies={settings.session_cookie_name: token_b})
        resp_b = client_b.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
        assert resp_b.status_code == 403
        assert "Access denied" in resp_b.json()["detail"]

        # 3. Visitor A downloads successfully with correct attachment and nosniff headers
        client_a = TestClient(app, cookies={settings.session_cookie_name: token_a})
        resp_a = client_a.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
        assert resp_a.status_code == 200
        assert resp_a.content == b"session_isolated_mp4_bytes"
        assert resp_a.headers.get("x-content-type-options") == "nosniff"
        assert f'filename="{job_id}.mp4"' in resp_a.headers.get("content-disposition", "")
    finally:
        if out_file.exists():
            out_file.unlink()


def test_session_expiry_rotates_and_isolates():
    # 1. Create a job under a session created 10 days ago (expired)
    past_timestamp = int(time.time()) - (10 * 24 * 3600)
    expired_token, expired_session_id = generate_session_token(timestamp=past_timestamp)

    job_id = "job_expired_session_test_01"
    job = JobRecord(
        job_id=job_id,
        session_id=expired_session_id,
        state=JobState.COMPLETED,
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Deep ocean exploration",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    # 2. Client sends request with expired session cookie
    client = TestClient(app, cookies={settings.session_cookie_name: expired_token})
    resp = client.get(f"/v1/jobs/{job_id}", headers={"X-API-Key": API_KEY})

    # The expired session is rejected, server rotated to fresh session -> access denied
    assert resp.status_code == 403

    # Ensure a fresh new session cookie was issued
    new_token = resp.cookies.get(settings.session_cookie_name)
    assert new_token is not None
    assert new_token != expired_token


def test_browser_isolation_headers_present():
    client = TestClient(app)
    resp = client.get("/v1/durations")
    assert resp.status_code == 200
    headers = resp.headers

    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "no-referrer"
    assert "accelerometer=()" in headers.get("permissions-policy", "")
    assert "frame-ancestors 'none'" in headers.get("content-security-policy", "")

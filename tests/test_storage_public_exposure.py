import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.core.session import generate_session_token
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import save_job_record

API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def test_download_sensitive_session_secret_blocked():
    """
    Attempting to download .session_secret via job output_path must be strictly blocked with 403.
    """
    token, session_id = generate_session_token()
    secret_file = settings.storage_dir / ".session_secret"
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    secret_file.write_text("dummy_sensitive_session_secret_key_12345678", encoding="utf-8")

    job_id = "job_leak_secret_test"
    job = JobRecord(
        job_id=job_id,
        session_id=session_id,
        state=JobState.COMPLETED,
        output_path=str(secret_file),
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Test prompt",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    client = TestClient(app, cookies={settings.session_cookie_name: token})
    resp = client.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_download_database_file_blocked():
    """
    Attempting to download jobs.db via job output_path must be strictly blocked with 403.
    """
    token, session_id = generate_session_token()
    db_file = settings.db_path
    db_file.parent.mkdir(parents=True, exist_ok=True)

    job_id = "job_leak_db_test"
    job = JobRecord(
        job_id=job_id,
        session_id=session_id,
        state=JobState.COMPLETED,
        output_path=str(db_file),
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Test prompt",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    client = TestClient(app, cookies={settings.session_cookie_name: token})
    resp = client.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_download_non_video_file_blocked(tmp_path):
    """
    Attempting to download non-video files (.txt, .json, .py) must be blocked with 403.
    """
    token, session_id = generate_session_token()
    out_dir = settings.storage_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    text_file = out_dir / "manifest.json"
    text_file.write_text('{"secret": "data"}', encoding="utf-8")

    job_id = "job_leak_json_test"
    job = JobRecord(
        job_id=job_id,
        session_id=session_id,
        state=JobState.COMPLETED,
        output_path=str(text_file),
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Test prompt",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    client = TestClient(app, cookies={settings.session_cookie_name: token})
    resp = client.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]


def test_legitimate_video_download_succeeds():
    """
    Legitimate video files in storage/outputs/ or storage/jobs/ must be downloadable.
    """
    token, session_id = generate_session_token()
    out_dir = settings.storage_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    video_file = out_dir / "valid_render.mp4"
    video_file.write_bytes(b"valid_mp4_bytes")

    job_id = "job_valid_download_test"
    job = JobRecord(
        job_id=job_id,
        session_id=session_id,
        state=JobState.COMPLETED,
        output_path=str(video_file),
        request=JobCreate(
            visual_mode="text_to_video",
            prompt="Test prompt",
            consent=ConsentRequest(
                authorized=True,
                statement="I consent to the generation of this AI video and accept the AI label.",
                ai_generated_accepted=True,
                ai_label_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    client = TestClient(app, cookies={settings.session_cookie_name: token})
    resp = client.get(f"/v1/jobs/{job_id}/download", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    assert resp.content == b"valid_mp4_bytes"
    assert resp.headers.get("x-content-type-options") == "nosniff"

import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import save_job_record
from src.db.repository import AssetRepository

API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


@pytest.fixture
def consent_payload():
    return {
        "authorized": True,
        "statement": "I consent to the generation of this AI video and accept the AI label.",
        "face_rights_attested": True,
        "voice_rights_attested": True,
        "ai_generated_accepted": True,
        "ai_label_accepted": True,
    }


def test_legacy_jobs_cannot_leak_to_anonymous_visitors():
    """
    Legacy jobs in the database (with session_id=None) must NOT leak into
    an anonymous visitor's fresh workspace list.
    """
    dummy_req = JobCreate(
        visual_mode="text_to_video",
        prompt="Sample legacy prompt",
        consent=ConsentRequest(
            authorized=True,
            statement="I consent to the generation of this AI video and accept the AI label.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )
    legacy_job = JobRecord(
        job_id="job_legacy_unowned_001",
        state=JobState.COMPLETED,
        session_id=None,
        client_id=None,
        request=dummy_req,
    )
    save_job_record(legacy_job)

    # Visitor B visits the site with an independent anonymous browser session
    client_b = TestClient(app)
    # Establish visitor session cookie as a real browser does
    client_b.get("/health")
    assert settings.session_cookie_name in client_b.cookies

    resp = client_b.get("/v1/jobs", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    job_ids = [j["job_id"] for j in resp.json()]

    # Legacy job must NOT leak into Visitor B's workspace
    assert "job_legacy_unowned_001" not in job_ids, (
        "Privacy violation: legacy job leaked into anonymous visitor's workspace list!"
    )


def test_legacy_job_idor_protection(tmp_path):
    """
    Anonymous visitors must NOT be allowed to read, download, cancel,
    or delete legacy jobs that do not belong to their session.
    """
    out_dir = settings.storage_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "job_legacy_idor_002.mp4"
    out_file.write_bytes(b"confidential legacy video content")

    dummy_req = JobCreate(
        visual_mode="text_to_video",
        prompt="Legacy confidential video",
        consent=ConsentRequest(
            authorized=True,
            statement="I consent to the generation of this AI video and accept the AI label.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )
    legacy_job = JobRecord(
        job_id="job_legacy_idor_002",
        state=JobState.COMPLETED,
        session_id=None,
        client_id=None,
        output_path=str(out_file),
        request=dummy_req,
    )
    save_job_record(legacy_job)

    client_b = TestClient(app)
    # Establish browser session cookie
    client_b.get("/health")
    assert settings.session_cookie_name in client_b.cookies

    auth_headers = {"X-API-Key": API_KEY}

    # 1. Visitor B attempts to read legacy job -> 403 Forbidden
    resp_read = client_b.get("/v1/jobs/job_legacy_idor_002", headers=auth_headers)
    assert resp_read.status_code == 403
    assert "Access denied" in resp_read.json()["detail"]

    # 2. Visitor B attempts to download legacy job video -> 403 Forbidden
    resp_dl = client_b.get("/v1/jobs/job_legacy_idor_002/download", headers=auth_headers)
    assert resp_dl.status_code == 403
    assert "Access denied" in resp_dl.json()["detail"]

    # 3. Visitor B attempts to cancel legacy job -> 403 Forbidden
    resp_cancel = client_b.post("/v1/jobs/job_legacy_idor_002/cancel", headers=auth_headers)
    assert resp_cancel.status_code == 403
    assert "Access denied" in resp_cancel.json()["detail"]

    # 4. Visitor B attempts to delete legacy job -> 403 Forbidden
    resp_del = client_b.delete("/v1/jobs/job_legacy_idor_002", headers=auth_headers)
    assert resp_del.status_code == 403
    assert "Access denied" in resp_del.json()["detail"]


def test_legacy_asset_idor_protection(consent_payload, monkeypatch):
    """
    Anonymous visitors must NOT be allowed to hijack or reference legacy assets
    that do not belong to their session.
    """
    from src.api import routes as api_routes
    from unittest.mock import MagicMock
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())

    # Create a legacy asset in AssetRepository with session_id=None
    AssetRepository.save(
        asset_id="photo_legacy_private_001",
        kind="photo",
        filename="private_photo.jpg",
        path="storage/assets/private_photo.jpg",
        size_bytes=1024,
        sha256="abc123sha",
        session_id=None,
    )

    client_b = TestClient(app)
    client_b.get("/health")
    auth_headers = {"X-API-Key": API_KEY}

    # Visitor B tries to create a job referencing the legacy private photo
    resp = client_b.post(
        "/v1/jobs",
        json={
            "visual_mode": "picture_to_video",
            "photo_asset_id": "photo_legacy_private_001",
            "consent": {
                "authorized": True,
                "statement": "I consent to the generation of this AI video and accept the AI label.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
                "ai_generated_accepted": True,
                "ai_label_accepted": True,
            },
        },
        headers=auth_headers,
    )
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]

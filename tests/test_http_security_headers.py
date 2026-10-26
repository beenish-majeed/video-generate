from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import JobCreate, JobRecord, JobState, ConsentRequest
from src.services.jobs import save_job_record


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers = {"X-API-Key": settings.api_key or "test_key"}
    return c


def test_standard_endpoint_security_headers(client):
    resp = client.get("/health")
    assert resp.status_code == 200

    headers = {k.lower(): v for k, v in resp.headers.items()}
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("referrer-policy") == "no-referrer"
    assert headers.get("x-frame-options") == "DENY"
    assert "frame-ancestors 'none'" in headers.get("content-security-policy", "")
    assert "default-src 'none'" in headers.get("content-security-policy", "")


def test_download_endpoint_headers_and_content_disposition(client, tmp_path):
    job_id = "job_sec_headers_test_123"
    job_dir = settings.storage_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    video_file = job_dir / "final_video.mp4"
    video_file.write_bytes(b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41")

    # Create dummy completed job record
    dummy_req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Hello world, this is a longer script to satisfy the minimum word count requirement.",
        target_duration_seconds=5.0,
        consent=ConsentRequest(
            authorized=True,
            statement="I authorize this video.",
            ai_generated_accepted=True,
        ),
    )
    job = JobRecord(
        job_id=job_id,
        state=JobState.COMPLETED,
        request=dummy_req,
        output_path=str(video_file),
    )
    save_job_record(job)

    resp = client.get(f"/v1/jobs/{job_id}/download")
    assert resp.status_code == 200

    headers = {k.lower(): v for k, v in resp.headers.items()}
    assert headers.get("content-type") == "video/mp4"
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("referrer-policy") == "no-referrer"
    assert headers.get("x-frame-options") == "DENY"
    assert f'filename="{job_id}.mp4"' in headers.get("content-disposition", "")
    assert "attachment" in headers.get("content-disposition", "")

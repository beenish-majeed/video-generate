import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import JobRecord, JobState, JobCreate, ConsentRequest
from src.services.jobs import save_job_record
from src.services.store import job_dir


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers = {"X-API-Key": settings.api_key or "test_key"}
    return c


def test_job_dir_rejects_path_traversal():
    with pytest.raises(ValueError, match="Invalid job_id"):
        job_dir("../../etc/passwd")

    with pytest.raises(ValueError, match="Invalid job_id"):
        job_dir("..\\..\\windows\\system32")

    with pytest.raises(ValueError, match="Invalid job_id"):
        job_dir("/etc/shadow")


def test_download_endpoint_rejects_out_of_bounds_path(client, tmp_path):
    # Outside file
    outside_file = tmp_path / "sensitive.txt"
    outside_file.write_text("classified data")

    job_id = "job_traversal_test_123"
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Hello world, this is a test script with enough words.",
        prompt="Make a video",
        consent=ConsentRequest(
            authorized=True,
            statement="I authorize this video generation.",
            ai_generated_accepted=True,
        ),
    )
    job = JobRecord(
        job_id=job_id,
        state=JobState.COMPLETED,
        request=req,
        output_path=str(outside_file),
    )
    save_job_record(job)

    resp = client.get(f"/v1/jobs/{job_id}/download")
    assert resp.status_code == 403
    assert "Access denied: invalid file location" in resp.json()["detail"]

import concurrent.futures
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import JOBS, list_all_jobs


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers = {"X-API-Key": settings.api_key or "test_key"}
    return c


def test_concurrent_job_creation_strictly_respects_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "max_active_jobs_cap", 2)
    monkeypatch.setattr("src.main.JOB_CREATION_LIMITER.max_requests", 100)

    # Clean up JOBS in-memory cache for this test
    JOBS.clear()

    # Avoid actually running Wav2Lip/heavy jobs in the test
    monkeypatch.setattr("src.main.JOB_EXECUTOR.submit", lambda *args, **kwargs: None)

    payload = {
        "avatar_preset_id": "avatar_default",
        "voice_preset_id": "voice_piper_lessac",
        "script": "Hello world, this is a test script for concurrent job capacity check.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": True,
            "statement": "I own this face and voice and authorize generation.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
            "ai_generated_accepted": True,
        },
    }

    results = []

    def submit_job(i):
        # Create client per thread or reuse testclient
        resp = client.post("/v1/jobs", json=payload)
        return resp.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(submit_job, i) for i in range(8)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    accepted = [r for r in results if r == 202]
    rejected_busy = [r for r in results if r == 503]

    assert len(accepted) == 2
    assert len(rejected_busy) == 6

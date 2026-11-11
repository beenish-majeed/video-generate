import sqlite3
import pytest
from pathlib import Path

from src.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services import jobs


def test_jobs_db_dynamically_adapts_to_storage_dir(tmp_path, monkeypatch):
    """When settings.storage_dir is reconfigured, job persistence targets the new directory."""
    new_storage = tmp_path / "custom_storage"
    new_storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "storage_dir", new_storage)

    dummy_req = JobCreate(
        visual_mode="text_to_video",
        prompt="Dynamic DB test",
        consent=ConsentRequest(
            authorized=True,
            statement="I consent to the generation of this AI video and accept the AI label.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )
    job = JobRecord(
        job_id="job_dyn_test_001",
        state=JobState.RECEIVED,
        request=dummy_req,
    )

    jobs.save_job_record(job)

    # The new jobs.db must exist in new_storage, NOT the default storage dir
    expected_db = new_storage / "jobs.db"
    assert expected_db.exists(), f"Expected database file to be created at {expected_db}"

    # Verify record was stored in the new db file directly
    with sqlite3.connect(expected_db) as conn:
        row = conn.execute("SELECT job_id, state FROM jobs WHERE job_id = ?", ("job_dyn_test_001",)).fetchone()
        assert row is not None
        assert row[0] == "job_dyn_test_001"

    # Reading it back works seamlessly
    loaded = jobs.load_job_record("job_dyn_test_001")
    assert loaded is not None
    assert loaded.job_id == "job_dyn_test_001"

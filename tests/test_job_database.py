from src.models.schemas import (
    ConsentRequest,
    JobCreate,
    JobRecord,
    JobState,
)
from src.services.jobs import save_job_record, load_job_record, list_all_jobs


def test_sqlite_job_persistence(tmp_path, monkeypatch):
    test_db = tmp_path / "jobs_test.db"
    monkeypatch.setattr("src.services.jobs.DB_PATH", test_db)
    monkeypatch.setattr("src.services.jobs._init_db", lambda: None)
    
    import sqlite3
    with sqlite3.connect(test_db) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    request = JobCreate(
        photo_asset_id="photo_123",
        voice_asset_id="voice_123",
        script="Test script",
        prompt="Test prompt",
        consent=consent,
    )

    job = JobRecord(
        job_id="job_persist_123",
        state=JobState.RECEIVED,
        request=request,
        photo_path="storage/assets/photo_123.jpg",
        voice_path="storage/assets/voice_123.wav",
    )

    save_job_record(job)

    # Clear memory cache
    from src.services.jobs import JOBS
    JOBS.clear()

    # Load from DB
    loaded = load_job_record("job_persist_123")
    assert loaded is not None
    assert loaded.job_id == "job_persist_123"
    assert loaded.state == JobState.RECEIVED
    assert loaded.photo_path == "storage/assets/photo_123.jpg"

    all_jobs = list_all_jobs()
    assert any(j.job_id == "job_persist_123" for j in all_jobs)

import pytest
from pathlib import Path
from src.db.database import get_db_connection, init_database
from src.db.repository import AssetRepository, AuditRepository, ConsentRepository, JobRepository
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_studio.db"
    monkeypatch.setattr("src.db.database.get_db_path", lambda: test_db)
    init_database()
    return test_db


def test_init_database_idempotent():
    # Calling init_database multiple times should not fail
    init_database()
    init_database()
    with get_db_connection() as conn:
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
        table_names = {t["name"] for t in tables}
        assert "jobs" in table_names
        assert "assets" in table_names
        assert "consents" in table_names
        assert "audit_logs" in table_names


def test_job_repository_crud():
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="This is a comprehensive and completely valid test script that meets all validation length requirements.",
        consent=ConsentRequest(authorized=True),
        target_duration_seconds=5.0,
    )
    job = JobRecord(job_id="job_000000000001", request=req, state=JobState.RECEIVED)

    # Save
    JobRepository.save(job)

    # Get
    fetched = JobRepository.get("job_000000000001")
    assert fetched is not None
    assert fetched.job_id == "job_000000000001"
    assert fetched.state == JobState.RECEIVED

    # Active count
    assert JobRepository.count_active_jobs() == 1

    # Interrupted jobs
    interrupted = JobRepository.get_interrupted_jobs()
    assert len(interrupted) == 1
    assert interrupted[0].job_id == "job_000000000001"

    # Update to terminal
    job.state = JobState.COMPLETED
    JobRepository.save(job)
    assert JobRepository.count_active_jobs() == 0
    assert len(JobRepository.get_interrupted_jobs()) == 0

    # List recent
    recent = JobRepository.list_recent(limit=10)
    assert len(recent) == 1
    assert recent[0].job_id == "job_000000000001"

    # Delete
    deleted = JobRepository.delete("job_000000000001")
    assert deleted is True
    assert JobRepository.get("job_000000000001") is None


def test_asset_repository_crud():
    asset = AssetRepository.save(
        asset_id="photo_1234567890ab",
        kind="photo",
        filename="portrait.png",
        path="/tmp/photo_1234567890ab.png",
        size_bytes=1024,
        sha256="abc123hash",
        duration_seconds=None,
    )
    assert asset.asset_id == "photo_1234567890ab"

    fetched = AssetRepository.get("photo_1234567890ab")
    assert fetched is not None
    assert fetched.filename == "portrait.png"
    assert fetched.size_bytes == 1024

    all_assets = AssetRepository.list_all(kind="photo")
    assert len(all_assets) == 1

    deleted = AssetRepository.delete("photo_1234567890ab")
    assert deleted is True
    assert AssetRepository.get("photo_1234567890ab") is None


def test_consent_and_audit_repositories():
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="This is a comprehensive and completely valid test script that meets all validation length requirements.",
        consent=ConsentRequest(authorized=True),
        target_duration_seconds=5.0,
    )
    job = JobRecord(job_id="job_000000000002", request=req, state=JobState.RECEIVED)
    JobRepository.save(job)

    consent_id = ConsentRepository.record_consent(
        job_id="job_000000000002",
        authorized=True,
        statement="I authorize this generation.",
        clips_rights_attested=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
    )
    assert consent_id > 0

    consent = ConsentRepository.get_by_job_id("job_000000000002")
    assert consent is not None
    assert consent.authorized is True
    assert consent.clips_rights_attested is True
    assert consent.statement == "I authorize this generation."

    log_id = AuditRepository.log(
        action="JOB_CREATED",
        resource_id="job_000000000002",
        client_ip="127.0.0.1",
        details="Job created via API",
    )
    assert log_id > 0

    logs = AuditRepository.list_recent(limit=5)
    assert len(logs) == 1
    assert logs[0].action == "JOB_CREATED"
    assert logs[0].client_ip == "127.0.0.1"

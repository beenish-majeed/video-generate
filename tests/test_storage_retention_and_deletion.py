from datetime import datetime, timedelta, timezone
from pathlib import Path
import time
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState, utcnow
from src.services.jobs import (
    JOBS,
    delete_job_record,
    get_job,
    save_job_record,
)
from src.services.storage_retention import clean_expired_storage
from src.services.store import ASSETS_DIR, JOBS_DIR

client = TestClient(app)
SECURE_KEY = "test_cryptographic_secret_key_123456"


def test_delete_completed_job_endpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    job_id = "job_test_to_delete_123"
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    manifest = job_dir / "manifest.json"
    manifest.write_text("{}", encoding="utf-8")

    rec = JobRecord(
        job_id=job_id,
        state=JobState.COMPLETED,
        request=JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            consent=ConsentRequest(authorized=True, statement="I authorize generation."),
        ),
    )
    save_job_record(rec)

    # Call DELETE /v1/jobs/{id}
    resp = client.delete(f"/v1/jobs/{job_id}", headers={"X-API-Key": SECURE_KEY})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "deleted": True, "job_id": job_id}

    # Verify directory and record are gone
    assert not job_dir.exists()
    assert get_job(job_id) is None


def test_delete_active_job_returns_409(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    job_id = "job_active_running_123"
    rec = JobRecord(
        job_id=job_id,
        state=JobState.GENERATING_SEGMENTS,
        request=JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            consent=ConsentRequest(authorized=True, statement="I authorize generation."),
        ),
    )
    save_job_record(rec)

    resp = client.delete(f"/v1/jobs/{job_id}", headers={"X-API-Key": SECURE_KEY})
    assert resp.status_code == 409
    assert "Cannot delete active job" in resp.json()["detail"]


def test_clean_expired_storage_never_touches_active_job_or_its_assets(monkeypatch):
    # Setup test retention config
    monkeypatch.setattr(settings, "asset_retention_hours", 1.0)
    monkeypatch.setattr(settings, "job_retention_hours", 1.0)

    # 1. Active job with referenced asset
    active_job_id = "job_active_test_keep"
    active_asset_id = "photo_active_test_keep"
    active_asset_path = ASSETS_DIR / f"{active_asset_id}.png"
    active_asset_path.write_text("active asset bytes")

    # Set asset file mtime to 10 hours ago (older than 1h TTL)
    old_time = time.time() - (10 * 3600)
    import os
    os.utime(active_asset_path, (old_time, old_time))

    rec = JobRecord(
        job_id=active_job_id,
        state=JobState.ASSEMBLING,
        request=JobCreate(
            photo_asset_id=active_asset_id,
            voice_asset_id="voice_active_test_keep",
            consent=ConsentRequest(
                authorized=True,
                statement="I authorize generation and own all rights.",
                face_rights_attested=True,
                voice_rights_attested=True,
            ),
        ),
    )
    save_job_record(rec)

    # 2. Expired unreferenced asset
    unref_asset = ASSETS_DIR / "photo_expired_unreferenced.png"
    unref_asset.write_text("unreferenced old bytes")
    os.utime(unref_asset, (old_time, old_time))

    # 3. Expired completed job
    expired_job_id = "job_expired_completed_123"
    expired_job_dir = JOBS_DIR / expired_job_id
    expired_job_dir.mkdir(parents=True, exist_ok=True)
    (expired_job_dir / "manifest.json").write_text("{}")
    os.utime(expired_job_dir, (old_time, old_time))
    expired_rec = JobRecord(
        job_id=expired_job_id,
        state=JobState.COMPLETED,
        updated_at=datetime.now(timezone.utc) - timedelta(hours=5),
        request=JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            consent=ConsentRequest(authorized=True, statement="I authorize generation."),
        ),
    )
    save_job_record(expired_rec, update_timestamp=False)

    # Run cleanup
    res = clean_expired_storage()

    # Active asset and active job MUST NOT be touched
    assert active_asset_path.exists(), "Active asset was incorrectly deleted!"
    assert get_job(active_job_id) is not None

    # Unreferenced expired asset must be deleted
    assert not unref_asset.exists()

    # Expired terminal job must be deleted
    assert not expired_job_dir.exists()
    assert get_job(expired_job_id) is None
    assert res["deleted_assets"] >= 1
    assert res["deleted_jobs"] >= 1

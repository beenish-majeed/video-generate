import pytest
from pathlib import Path
from unittest.mock import MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from src.api.error_handlers import unhandled_exception_handler
from src.clients.file_ai import FileAIClient
from src.config import settings
from src.core.api_config import FileAIConfig
from src.db.repository import AssetRepository, JobRepository
from src.main import app, lifespan
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import (
    create_job,
    delete_job_record,
    load_job_record,
    save_job_record,
)
from src.services.storage_retention import get_active_assets_and_jobs
from src.services.store import get_asset_path


client = TestClient(app)


def test_synthesize_speech_empty_text_returns_silence(tmp_path):
    """Empty or whitespace text must synthesize valid silence without making remote API calls."""
    config = FileAIConfig(api_key="")
    ai_client = FileAIClient(config=config)
    wav_out = tmp_path / "empty_speech.wav"
    res = ai_client.synthesize_speech(text="   ", output_path=wav_out, duration_seconds=2.5)

    assert wav_out.exists()
    assert res["duration_seconds"] == 2.5
    assert res["word_timestamps"] == []


def test_avatar_segment_input_validation(tmp_path):
    """Missing input files must raise FileNotFoundError before invoking subprocesses."""
    config = FileAIConfig(api_key="")
    ai_client = FileAIClient(config=config)
    fake_img = tmp_path / "missing_img.jpg"
    fake_aud = tmp_path / "missing_aud.wav"
    out_mp4 = tmp_path / "out.mp4"

    with pytest.raises(FileNotFoundError) as exc_info:
        ai_client.generate_avatar_segment(fake_img, fake_aud, out_mp4, duration_seconds=5.0)
    assert "Avatar image not found" in str(exc_info.value)


def test_get_asset_path_indexed_lookup(tmp_path, monkeypatch):
    """Asset resolution should query the indexed AssetRepository in O(1)."""
    fake_asset_id = "photo_audit_test_123456789"
    assets_dir = settings.storage_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    test_file = assets_dir / f"{fake_asset_id}.jpg"
    test_file.write_bytes(b"\xFF\xD8\xFF\xE0" + b"\x00" * 20)

    try:
        AssetRepository.save(
            asset_id=fake_asset_id,
            kind="photo",
            filename="test.jpg",
            path=str(test_file),
            size_bytes=test_file.stat().st_size,
            sha256="fakehash",
        )
        resolved = get_asset_path(fake_asset_id)
        assert resolved is not None
        assert resolved.resolve() == test_file.resolve()
    finally:
        test_file.unlink(missing_ok=True)
        AssetRepository.delete(fake_asset_id)


def test_storage_retention_protects_clips_in_flight(monkeypatch):
    """Active ai_clips jobs must protect clip_asset_ids from storage pruning."""
    clip_id_1 = "clip_active_001"
    clip_id_2 = "clip_active_002"

    req = JobCreate(
        visual_mode="ai_clips",
        clip_asset_ids=[clip_id_1, clip_id_2],
        voice_preset_id="voice_piper_lessac",
        script="A peaceful journey through the scenic mountain trails.",
        consent=ConsentRequest(
            authorized=True,
            statement="I authorize this test video generation.",
            clips_rights_attested=True,
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )
    # Mock asset paths so job creation succeeds
    assets_dir = settings.storage_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    p1 = assets_dir / f"{clip_id_1}.mp4"
    p2 = assets_dir / f"{clip_id_2}.mp4"
    p1.write_bytes(b"\x00" * 50)
    p2.write_bytes(b"\x00" * 50)

    job = None
    try:
        job = create_job(req)
        assert job.state == JobState.CONSENT_VERIFIED

        _, active_assets = get_active_assets_and_jobs()
        assert clip_id_1 in active_assets
        assert clip_id_2 in active_assets
    finally:
        if job is not None:
            job.state = JobState.COMPLETED
            save_job_record(job)
            delete_job_record(job.job_id)
        p1.unlink(missing_ok=True)
        p2.unlink(missing_ok=True)


@pytest.mark.anyio
async def test_unhandled_exception_handler_preserves_headers():
    """HTTPException headers (e.g. Retry-After) must be preserved in JSON response."""
    scope = {"type": "http", "method": "GET", "path": "/test"}
    req = Request(scope)
    exc = HTTPException(
        status_code=429,
        detail="Rate limit exceeded",
        headers={"Retry-After": "120"},
    )
    resp = await unhandled_exception_handler(req, exc)
    assert resp.status_code == 429
    assert resp.headers.get("Retry-After") == "120"


def test_dual_column_db_sync(tmp_path):
    """Job saving and loading must support dual column synchronization."""
    job_id = f"job_dual_col_{tmp_path.name}"
    job = JobRecord(
        job_id=job_id,
        state=JobState.RECEIVED,
        request=JobCreate(
            visual_mode="slideshow",
            script="Short test script for dual column verification.",
            voice_preset_id="voice_piper_lessac",
            consent=ConsentRequest(
                authorized=True,
                statement="Authorized test",
                ai_generated_accepted=True,
            ),
        ),
    )
    save_job_record(job)

    try:
        loaded = load_job_record(job_id)
        assert loaded is not None
        assert loaded.job_id == job_id
        assert loaded.state == JobState.RECEIVED
    finally:
        job.state = JobState.COMPLETED
        save_job_record(job)
        delete_job_record(job_id)

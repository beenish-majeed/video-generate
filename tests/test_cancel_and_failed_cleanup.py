from datetime import timedelta
from pathlib import Path
import pytest

from src.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState, utcnow
from src.services.store import job_dir as get_job_dir
from src.services.jobs import (
    _cleanup_intermediate_job_files,
    cancel_job,
    save_job_record,
)


@pytest.fixture
def dummy_job():
    def _create(job_id: str, state: JobState = JobState.GENERATING_SEGMENTS) -> tuple[JobRecord, Path]:
        job_path = get_job_dir(job_id)
        job_path.mkdir(parents=True, exist_ok=True)

        req = JobCreate(
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
        job = JobRecord(job_id=job_id, state=state, request=req)
        save_job_record(job)

        # Populate intermediate files
        (job_path / "manifest.json").write_text('{"job_id": "' + job_id + '"}', encoding="utf-8")
        (job_path / "joined_video.mp4").write_bytes(b"dummy video data")
        (job_path / "final_audio.wav").write_bytes(b"dummy audio wav")
        (job_path / "speech_0000.wav").write_bytes(b"dummy speech wav")
        seg_dir = job_path / "segments"
        seg_dir.mkdir(exist_ok=True)
        (seg_dir / "seg_001.mp4").write_bytes(b"segment data")

        return job, job_path

    return _create


def test_cancel_deletes_intermediate_segments_and_stems_immediately(dummy_job):
    job_id = "job_cancel_cleanup_test_01"
    job, job_dir = dummy_job(job_id, state=JobState.GENERATING_SEGMENTS)

    # Cancel the running job
    cancelled = cancel_job(job_id)
    assert cancelled is not None
    assert cancelled.state == JobState.CANCELLED

    # Manifest must be preserved for diagnosis/reporting
    assert (job_dir / "manifest.json").exists()

    # Intermediate segments and audio stems must be removed immediately
    assert not (job_dir / "joined_video.mp4").exists()
    assert not (job_dir / "final_audio.wav").exists()
    assert not (job_dir / "speech_0000.wav").exists()
    assert not (job_dir / "segments").exists()


def test_failed_job_keeps_files_within_debug_retention(dummy_job):
    job_id = "job_failed_retention_test_02"
    job, job_dir = dummy_job(job_id, state=JobState.FAILED)

    # Run cleanup when job has just failed (age 0s < 24h retention)
    _cleanup_intermediate_job_files(
        job_dir,
        is_failed=True,
        is_cancelled=False,
        updated_at=utcnow(),
    )

    # All debug stems and intermediate files must be preserved within retention window
    assert (job_dir / "manifest.json").exists()
    assert (job_dir / "final_audio.wav").exists()
    assert (job_dir / "joined_video.mp4").exists()
    assert (job_dir / "segments" / "seg_001.mp4").exists()


def test_failed_job_cleans_files_after_debug_retention_expired(dummy_job):
    job_id = "job_failed_expired_test_03"
    job, job_dir = dummy_job(job_id, state=JobState.FAILED)

    # Simulate expired retention period (e.g., 25 hours ago)
    expired_time = utcnow() - timedelta(hours=settings.failed_job_retention_hours + 1)
    _cleanup_intermediate_job_files(
        job_dir,
        is_failed=True,
        is_cancelled=False,
        updated_at=expired_time,
    )

    # Expired intermediate files must be purged, manifest preserved
    assert (job_dir / "manifest.json").exists()
    assert not (job_dir / "final_audio.wav").exists()
    assert not (job_dir / "joined_video.mp4").exists()
    assert not (job_dir / "segments").exists()

import pytest
from pathlib import Path
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import (
    _cleanup_intermediate_job_files,
    recover_interrupted_jobs,
    save_job_record,
    load_job_record,
)


def test_cleanup_intermediate_files(tmp_path):
    # Create synthetic job directory structure
    job_dir = tmp_path / "job_test_clean_123"
    job_dir.mkdir(parents=True, exist_ok=True)

    # Output artifacts that should be KEPT
    final_vid = job_dir / "final_video.mp4"
    final_vid.write_text("dummy mp4 video content")

    manifest = job_dir / "manifest.json"
    manifest.write_text("{}")

    subtitles = job_dir / "subtitles.vtt"
    subtitles.write_text("WEBVTT")

    # Intermediate files & dirs that MUST be DELETED
    audio_dir = job_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    (audio_dir / "seg1.wav").write_text("audio seg")

    video_dir = job_dir / "videos"
    video_dir.mkdir(parents=True, exist_ok=True)
    (video_dir / "seg1.mp4").write_text("video seg")

    merged_wav = job_dir / "seg1_merged.wav"
    merged_wav.write_text("temp wav")

    face_crop = job_dir / "face_reference.jpg"
    face_crop.write_text("crop")

    # Run cleanup
    _cleanup_intermediate_job_files(job_dir)

    # Verify kept files exist
    assert final_vid.exists()
    assert manifest.exists()
    assert subtitles.exists()

    # Verify intermediate items are deleted
    assert not audio_dir.exists()
    assert not video_dir.exists()
    assert not merged_wav.exists()
    assert not face_crop.exists()


def test_startup_recovery_interrupted_jobs():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    req = JobCreate(
        photo_asset_id="photo_123",
        voice_asset_id="voice_123",
        script="Test script for recovery",
        prompt="Make a video",
        consent=consent,
    )

    # Create job stuck in GENERATING_SEGMENTS state
    stuck_job = JobRecord(
        job_id="job_stuck_recovery_123",
        state=JobState.GENERATING_SEGMENTS,
        request=req,
        photo_path="storage/assets/p1.jpg",
        voice_path="storage/assets/v1.wav",
    )
    save_job_record(stuck_job)

    # Run recovery
    count = recover_interrupted_jobs()
    assert count >= 1

    # Verify job state changed to FAILED with recovery message
    recovered = load_job_record("job_stuck_recovery_123")
    assert recovered is not None
    assert recovered.state == JobState.FAILED
    assert "interrupted by a server restart" in recovered.error

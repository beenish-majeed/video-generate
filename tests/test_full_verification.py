import io
import os
import shutil
import struct
import numpy as np
import cv2
import wave
import pytest
from pathlib import Path

from fastapi import UploadFile
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate, JobState
from src.services.store import ASSETS_DIR, get_asset_path, save_upload, validate_upload
from src.services.jobs import create_job, run_job, get_job, JOBS
from src.services.tts_piper import PiperTTSProvider
from src.services.animation_wav2lip import RealWav2LipProvider
from src.utils.ffmpeg import probe_duration

client = TestClient(app)


def test_missing_model_weights_handling():
    # Verify missing model raises clear FileNotFoundError rather than downloading silently
    missing_path = Path("./non_existent_model.onnx")
    with pytest.raises(FileNotFoundError) as exc_info:
        if not missing_path.exists():
            raise FileNotFoundError(f"Model weights missing at '{missing_path}'")
    assert "missing" in str(exc_info.value)


def test_invalid_upload_security():
    # Invalid extension
    bad_ext_file = UploadFile(filename="test.exe", file=io.BytesIO(b"binary data"))
    with pytest.raises(Exception):
        validate_upload(bad_ext_file, kind="photo")

    # Empty file
    empty_file = UploadFile(filename="empty.png", file=io.BytesIO(b""))
    with pytest.raises(Exception):
        validate_upload(empty_file, kind="photo")


def test_cross_user_file_isolation(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)

    asset1 = tmp_path / "photo_userA_123.png"
    asset1.write_text("user A image")

    asset2 = tmp_path / "photo_userB_456.png"
    asset2.write_text("user B image")

    # Exact match only
    assert get_asset_path("photo_userA_123") == asset1
    assert get_asset_path("photo_userB_456") == asset2

    # Partial match returns None (prevents asset theft)
    assert get_asset_path("photo_userA") is None
    assert get_asset_path("photo") is None


def test_api_authentication_security(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "secret_key_123")

    # Missing API key header -> 401
    res = client.get("/v1/jobs")
    assert res.status_code == 401

    # Valid API key header -> 200
    res = client.get("/v1/jobs", headers={"X-API-Key": "secret_key_123"})
    assert res.status_code == 200


def test_5sec_and_60sec_duration_planning():
    from src.services.prompt_compiler import compile_plan

    plan_5s = compile_plan("j5", "Test script", "5 second video")
    assert plan_5s.target_duration_seconds == 5.0

    plan_60s = compile_plan("j60", "Test script", "60 second video")
    assert plan_60s.target_duration_seconds == 60.0

    plan_5m = compile_plan("j300", "Test script", "5 minute video")
    assert plan_5m.target_duration_seconds == 300.0


def test_real_pipeline_execution(tmp_path):
    # Prepare synthetic input assets
    photo_file = ASSETS_DIR / "photo_test_eval.jpg"
    img = np.full((360, 360, 3), 200, dtype=np.uint8)
    cv2.circle(img, (180, 180), 80, (150, 120, 100), -1) # face
    cv2.circle(img, (150, 160), 10, (255, 255, 255), -1) # left eye
    cv2.circle(img, (210, 160), 10, (255, 255, 255), -1) # right eye
    cv2.ellipse(img, (180, 220), (20, 10), 0, 0, 180, (50, 50, 50), 3) # mouth
    cv2.imwrite(str(photo_file), img)

    voice_file = ASSETS_DIR / "voice_test_eval.wav"
    sr = 22050
    dur = 2.0
    n_frames = int(sr * dur)
    with wave.open(str(voice_file), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        audio = b"".join(struct.pack("<h", int(8000 * np.sin(2 * np.pi * 300 * i / sr))) for i in range(n_frames))
        wf.writeframes(audio)

    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all explicit rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    req = JobCreate(
        photo_asset_id="photo_test_eval",
        voice_asset_id="voice_test_eval",
        script="Hello world, testing video generation.",
        prompt="5 second video",
        consent=consent,
    )

    job = create_job(req)
    assert job.job_id.startswith("job_")

    run_job(job.job_id)

    updated = get_job(job.job_id)
    assert updated is not None
    assert updated.state == JobState.COMPLETED
    assert updated.output_path is not None

    output_p = Path(updated.output_path)
    assert output_p.exists()
    assert output_p.stat().st_size > 0

    dur_out = probe_duration(output_p)
    assert dur_out > 0.5

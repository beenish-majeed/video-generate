import shutil
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from PIL import Image

from src.clients.file_ai import FileAIClient, FileAIError, _validate_download_url
from src.core.api_config import FileAIConfig
from src.models.schemas import ConsentRequest, JobCreate, JobEstimateRequest, JobState
from src.services.jobs import create_job, load_job_record, run_job
from src.services.store import ASSETS_DIR, get_asset_path
from src.utils.ffmpeg import make_tone_wav


@pytest.fixture
def test_consent():
    return ConsentRequest(
        authorized=True,
        statement="I consent to the generation of this AI video and accept the AI label.",
        ai_generated_accepted=True,
        ai_label_accepted=True,
    )


@pytest.fixture
def sample_image(tmp_path):
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    asset_id = f"asset_img_{tmp_path.name[:8]}"
    img_path = ASSETS_DIR / f"{asset_id}.jpg"
    img = Image.new("RGB", (640, 640), color=(80, 140, 200))
    img.save(img_path)
    return asset_id, img_path


@pytest.fixture
def sample_audio(tmp_path):
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    asset_id = f"asset_aud_{tmp_path.name[:8]}"
    audio_path = ASSETS_DIR / f"{asset_id}.wav"
    make_tone_wav(audio_path, seconds=3.0, freq=300, volume=0.04)
    return asset_id, audio_path


def test_text_to_video_mode1_end_to_end(test_consent, tmp_path):
    """
    MODE 1: TEXT TO VIDEO
    - User enters text prompt.
    - AI generates script.
    - AI scene planning.
    - Visual generation.
    - Audio voice synthesis.
    - Final video assembly.
    """
    req = JobCreate(
        visual_mode="text_to_video",
        prompt="The mysteries of deep ocean exploration and ancient shipwrecks",
        target_duration_seconds=5.0,
        voice_preset_id="voice_piper_lessac",
        consent=test_consent,
    )
    assert req.canonical_mode == "text_to_video"
    assert req.audio_mode == "ai_generated"

    job = create_job(req)
    assert job.state == JobState.CONSENT_VERIFIED
    assert job.estimated_render_seconds == pytest.approx(4.2, abs=0.5)

    run_job(job.job_id)

    completed = load_job_record(job.job_id)
    assert completed is not None
    assert completed.state == JobState.COMPLETED
    assert completed.output_path is not None
    out_file = Path(completed.output_path)
    assert out_file.exists()
    assert out_file.stat().st_size > 1000
    assert completed.visual_mode_used in ("text_to_video", "slideshow")


def test_picture_to_video_mode2_default_ai_audio_end_to_end(test_consent, sample_image):
    """
    MODE 2: PICTURE TO VIDEO (Default AI Audio)
    - User uploads image.
    - Animate image.
    - AI-generated audio enabled by default.
    - Assemble final video.
    """
    img_asset_id, _ = sample_image
    req = JobCreate(
        visual_mode="picture_to_video",
        photo_asset_id=img_asset_id,
        prompt="A serene portrait in twilight with gentle cinematic motion",
        target_duration_seconds=4.0,
        voice_preset_id="voice_piper_lessac",
        consent=test_consent,
    )
    assert req.canonical_mode == "picture_to_video"
    assert req.audio_mode == "ai_generated"

    job = create_job(req)
    assert job.state == JobState.CONSENT_VERIFIED
    assert job.estimated_render_seconds == pytest.approx(10.8, abs=0.5)

    run_job(job.job_id)

    completed = load_job_record(job.job_id)
    assert completed is not None
    assert completed.state == JobState.COMPLETED
    assert completed.output_path is not None
    out_file = Path(completed.output_path)
    assert out_file.exists()
    assert out_file.stat().st_size > 1000
    assert completed.visual_mode_used == "picture_to_video"


def test_picture_to_video_mode2_original_audio_end_to_end(test_consent, sample_image, sample_audio):
    """
    MODE 2: PICTURE TO VIDEO (User-provided Original Audio)
    - User uploads image.
    - User provides original audio.
    - Animate image.
    - Use original audio in final video.
    - Assemble final video.
    """
    img_asset_id, _ = sample_image
    aud_asset_id, _ = sample_audio
    req = JobCreate(
        visual_mode="picture_to_video",
        photo_asset_id=img_asset_id,
        uploaded_audio_asset_id=aud_asset_id,
        prompt="Ambient animation",
        consent=test_consent,
    )
    assert req.canonical_mode == "picture_to_video"
    assert req.audio_mode == "original_audio"

    job = create_job(req)
    assert job.state == JobState.CONSENT_VERIFIED

    run_job(job.job_id)

    completed = load_job_record(job.job_id)
    assert completed is not None
    assert completed.state == JobState.COMPLETED
    assert completed.output_path is not None
    out_file = Path(completed.output_path)
    assert out_file.exists()
    assert out_file.stat().st_size > 1000
    assert completed.visual_mode_used == "picture_to_video"


def test_mode_validation_rules(test_consent, sample_image):
    # Mode 1: text_to_video requires prompt or script
    with pytest.raises(Exception):
        JobCreate(
            visual_mode="text_to_video",
            prompt="",
            script="",
            consent=test_consent,
        )

    # Mode 2: picture_to_video requires an image
    with pytest.raises(Exception):
        JobCreate(
            visual_mode="picture_to_video",
            photo_asset_id=None,
            avatar_preset_id=None,
            uploaded_image_asset_ids=[],
            consent=test_consent,
        )


def test_job_estimate_canonical_modes():
    t2v_req = JobEstimateRequest(
        target_duration_seconds=20.0,
        visual_mode="text_to_video",
    )
    assert t2v_req.visual_mode == "text_to_video"

    p2v_req = JobEstimateRequest(
        target_duration_seconds=20.0,
        visual_mode="picture_to_video",
    )
    assert p2v_req.visual_mode == "picture_to_video"


def test_transparent_generation_source(tmp_path):
    # Sandbox fallback reports "sandbox_fallback"
    cfg_unconfigured = FileAIConfig(api_key="")
    client_unconfigured = FileAIClient(config=cfg_unconfigured)
    img_in = tmp_path / "test_raw_img.png"
    Image.new("RGB", (320, 320), color=(50, 100, 150)).save(img_in)
    out_vid = tmp_path / "out_anim.mp4"

    res_sandbox = client_unconfigured.generate_image_to_video(
        image_path=img_in,
        output_path=out_vid,
        duration_seconds=2.0,
    )
    assert res_sandbox["generation_source"] == "sandbox_fallback"


def test_capabilities_canonical_two_modes(monkeypatch):
    from fastapi.testclient import TestClient
    from src.main import app
    from src.core.config import settings

    client = TestClient(app)
    headers = {"X-API-Key": "test-key"}

    monkeypatch.setattr(settings, "api_key", "test-key")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    # 1. Base capabilities advertises strictly two modes
    resp = client.get("/v1/capabilities", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["modes"] == ["text_to_video", "picture_to_video"]

    # 2. Estimate parameter with valid mode
    resp_est = client.get("/v1/capabilities?mode=text_to_video&duration_seconds=30", headers=headers)
    assert resp_est.status_code == 200
    assert "estimate" in resp_est.json()

    # 3. Invalid mode query is rejected with 400
    resp_bad = client.get("/v1/capabilities?mode=unknown_third_mode", headers=headers)
    assert resp_bad.status_code == 400
    assert "Canonical modes" in resp_bad.json()["detail"]

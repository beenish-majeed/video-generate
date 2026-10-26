import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.schemas import JobCreate
from src.services.prompt_compiler import compile_plan
from src.utils.ffmpeg import create_placeholder_video, make_silence_wav, finalize_video


@pytest.fixture
def api_client():
    from src.config import settings
    key = settings.api_key or "test_key"
    client = TestClient(app)
    client.headers = {"X-API-Key": key}
    return client


def test_api_rejects_safety_override_dot_notation(api_client):
    payload = {
        "avatar_preset_id": "avatar_01",
        "voice_preset_id": "voice_01",
        "script": "Hello world this is a test script for checking the safety label enforcement.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": True,
            "statement": "I own this content and authorize AI generation.",
            "accept_ai_terms": True,
        },
        "overrides": {
            "safety.visible_label": False,
        },
    }
    resp = api_client.post("/v1/jobs", json=payload)
    assert resp.status_code == 422
    assert "safety" in resp.text.lower() or "overrides" in resp.text.lower()


def test_api_rejects_safety_override_nested_dict(api_client):
    payload = {
        "avatar_preset_id": "avatar_01",
        "voice_preset_id": "voice_01",
        "script": "Hello world this is a test script for checking the safety label enforcement.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": True,
            "statement": "I own this content and authorize AI generation.",
            "accept_ai_terms": True,
        },
        "overrides": {
            "safety": {
                "visible_label": False,
                "label_text": "Completely Real",
            },
        },
    }
    resp = api_client.post("/v1/jobs", json=payload)
    assert resp.status_code == 422


def test_api_rejects_differently_cased_safety_overrides(api_client):
    payload = {
        "avatar_preset_id": "avatar_01",
        "voice_preset_id": "voice_01",
        "script": "Hello world this is a test script for checking the safety label enforcement.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": True,
            "statement": "I own this content and authorize AI generation.",
            "accept_ai_terms": True,
        },
        "overrides": {
            "SAFETY.VISIBLE_LABEL": False,
        },
    }
    resp = api_client.post("/v1/jobs", json=payload)
    assert resp.status_code == 422


def test_api_rejects_watermark_and_consent_overrides(api_client):
    for bad_key in ["watermark", "watermark_path", "consent.statement", "ai_label"]:
        payload = {
            "avatar_preset_id": "avatar_01",
            "voice_preset_id": "voice_01",
            "script": "Hello world this is a test script for checking the safety label enforcement.",
            "target_duration_seconds": 5.0,
            "consent": {
                "authorized": True,
                "statement": "I own this content and authorize AI generation.",
                "accept_ai_terms": True,
            },
            "overrides": {
                bad_key: False,
            },
        }
        resp = api_client.post("/v1/jobs", json=payload)
        assert resp.status_code == 422, f"Expected 422 for bad key '{bad_key}'"


def test_prompt_compiler_ignores_safety_overrides_and_keeps_label_enabled():
    plan = compile_plan(
        job_id="job_label_test",
        script="Short test script.",
        prompt="A nice video",
        overrides={
            "safety.visible_label": False,
            "safety.label_text": "100% Real",
            "watermark": False,
        },
    )
    assert plan.safety.visible_label is True
    assert plan.safety.label_text == "AI-generated"
    assert any("Safety override rejected" in w for w in plan.warnings)


def test_ai_label_present_in_rendered_video_frame(tmp_path):
    video_raw = tmp_path / "raw.mp4"
    audio_raw = tmp_path / "audio.wav"
    out_video = tmp_path / "final.mp4"

    # Create 1280x720 1-second blank video (dark blue background)
    create_placeholder_video(video_raw, duration=1.0, resolution="1280x720", fps=25)
    make_silence_wav(audio_raw, seconds=1.0)

    # Finalize video without passing any watermark_path (testing unconditional fallback)
    finalize_video(
        video_path=video_raw,
        audio_path=audio_raw,
        watermark_path=None,
        output_path=out_video,
        duration=1.0,
    )

    assert out_video.exists()
    assert out_video.stat().st_size > 0

    # Read frame from final video
    cap = cv2.VideoCapture(str(out_video))
    ret, frame = cap.read()
    cap.release()
    assert ret is True
    assert frame is not None

    # Watermark is placed at: x = 1280 - 280 - 24 = 976, y = 720 - 60 - 24 = 636
    # Width 280, Height 60
    # The badge has a semi-transparent black background and white text.
    # Outside the badge, pixels are the background color. Inside the badge region, pixels are altered.
    h, w, _ = frame.shape
    badge_region = frame[h - 84 : h - 24, w - 304 : w - 24]
    background_sample = frame[100:160, 100:380]

    # The badge region should NOT be identical to the background sample
    diff = cv2.absdiff(badge_region, background_sample)
    assert np.mean(diff) > 5.0, "Label region must differ significantly from unwatermarked background"


def test_slideshow_compositor_applies_ai_label_unconditionally(tmp_path):
    from src.services.slideshow_compositor import SlideshowCompositor

    video_raw = tmp_path / "slideshow_raw.mp4"
    audio_raw = tmp_path / "slideshow_audio.wav"
    out_video = tmp_path / "slideshow_final.mp4"

    create_placeholder_video(video_raw, duration=1.0, resolution="1280x720", fps=25)
    make_silence_wav(audio_raw, seconds=1.0)

    # Multiplex with watermark_path=None
    SlideshowCompositor.multiplex_final(
        video_path=video_raw,
        audio_path=audio_raw,
        output_path=out_video,
        target_duration=1.0,
        watermark_path=None,
    )

    assert out_video.exists()
    cap = cv2.VideoCapture(str(out_video))
    ret, frame = cap.read()
    cap.release()
    assert ret is True
    assert frame is not None

    h, w, _ = frame.shape
    badge_region = frame[h - 84 : h - 24, w - 304 : w - 24]
    background_sample = frame[100:160, 100:380]
    diff = cv2.absdiff(badge_region, background_sample)
    assert np.mean(diff) > 5.0, "Slideshow video must include AI label badge"


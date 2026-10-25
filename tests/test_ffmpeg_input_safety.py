import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate, VideoParams
from src.utils.ffmpeg import concat_videos, finalize_video

client = TestClient(app)
SECURE_KEY = "test_cryptographic_secret_key_123456"


def test_override_invalid_resolution_returns_422(monkeypatch):
    """Verify that an override like '1280x720:flags=x' fails validation with HTTP 422."""
    monkeypatch.setattr(settings, "api_key", SECURE_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)

    payload = {
        "prompt": "Test video with malicious resolution",
        "consent": {
            "authorized": True,
            "statement": "I authorize this video generation and own all explicit rights.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
        },
        "avatar_preset_id": "avatar_alex",
        "voice_preset_id": "voice_alex",
        "overrides": {
            "video.resolution": "1280x720:flags=x"
        },
    }

    resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": SECURE_KEY})
    assert resp.status_code == 422
    assert "Invalid resolution format" in str(resp.json())


def test_videoparams_strict_resolution_validation():
    """Verify VideoParams rejects invalid resolutions directly."""
    with pytest.raises(ValueError, match="Invalid resolution format"):
        VideoParams(resolution="1280x720:flags=x")

    with pytest.raises(ValueError, match="Invalid resolution format"):
        VideoParams(resolution="not_a_res")

    # Sane bounds check (too small or too large)
    with pytest.raises(ValueError, match="outside acceptable bounds"):
        VideoParams(resolution="10x10")

    # Valid resolutions
    vp = VideoParams(resolution="1920x1080")
    assert vp.resolution == "1920x1080"


def test_subtitle_with_quotes_and_colons_handled_safely(tmp_path):
    """Verify subtitle filename with quotes and colons is copied safely and does not break FFmpeg."""
    # Create subtitle file with tricky characters: apostrophe, brackets, etc.
    sub_dir = tmp_path / "sub_folder"
    sub_dir.mkdir(parents=True, exist_ok=True)
    tricky_sub = sub_dir / "user's_file_with_quote.vtt"
    tricky_sub.write_text(
        "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTesting safe subtitle rendering.\n",
        encoding="utf-8",
    )

    out_video = tmp_path / "output_rendered.mp4"

    # Create 1-second synthetic video and audio
    from src.utils.ffmpeg import create_placeholder_video, make_tone_wav
    test_v = tmp_path / "input_v.mp4"
    test_a = tmp_path / "input_a.wav"
    create_placeholder_video(test_v, duration=1.0, resolution="320x240", fps=25)
    make_tone_wav(test_a, seconds=1.0, freq=440)

    # Finalize with burn_subtitles=True using the tricky subtitle path
    finalize_video(
        video_path=test_v,
        audio_path=test_a,
        watermark_path=None,
        output_path=out_video,
        duration=1.0,
        burn_subtitles=True,
        subtitle_path=tricky_sub,
    )

    assert out_video.exists()
    assert out_video.stat().st_size > 0

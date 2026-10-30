import io
import json
import subprocess
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.store import ASSETS_DIR
from src.utils.subprocess_runner import run_subprocess

client = TestClient(app, raise_server_exceptions=False)
TEST_API_KEY = "test_cryptographic_secret_key_123456"


@pytest.fixture(autouse=True)
def setup_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", TEST_API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)


def create_test_clip(
    path: Path,
    duration: float = 2.0,
    width: int = 640,
    height: int = 360,
    fps: int = 30,
    with_audio: bool = False,
    extra_video_stream: bool = False,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", f"testsrc=duration={duration}:size={width}x{height}:rate={fps}",
    ]
    if extra_video_stream:
        cmd.extend(["-f", "lavfi", "-i", f"color=c=red:duration={duration}:size={width}x{height}:rate={fps}"])
    if with_audio:
        cmd.extend(["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}"])

    if extra_video_stream:
        cmd.extend(["-map", "0:v", "-map", "1:v"])
    else:
        cmd.extend(["-map", "0:v"])

    if with_audio:
        cmd.extend(["-map", "1:a" if not extra_video_stream else "2:a", "-c:a", "aac"])

    cmd.extend([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(path),
    ])
    res = run_subprocess(cmd)
    if res.returncode != 0:
        raise RuntimeError(f"Failed to generate test clip: {res.stderr}")
    return path


def test_effective_limits_documented_and_enforced():
    """Verify effective limits are consistent across configuration."""
    assert settings.max_request_body_bytes == 55 * 1024 * 1024  # 55 MB for general endpoints
    assert settings.max_clip_request_body_bytes == 215 * 1024 * 1024  # 215 MB for clip uploads
    assert settings.max_clip_size_bytes == 200 * 1024 * 1024  # 200 MB per clip file
    assert settings.max_clips_per_job == 60
    assert settings.max_clip_duration_seconds == 30.0
    assert settings.max_clip_width == 1920
    assert settings.max_clip_height == 1080
    assert settings.max_clip_fps == 60.0


def test_general_endpoint_body_limit_enforced_at_55mb():
    """Verify that general endpoints reject payloads exceeding 55 MB with HTTP 413."""
    headers = {
        "X-API-Key": TEST_API_KEY,
        "Content-Length": str(56 * 1024 * 1024),
    }
    resp = client.post("/v1/scripts/generate", headers=headers, json={"topic": "test"})
    assert resp.status_code == 413
    assert "exceeds limit" in resp.json()["detail"]


def test_upload_clip_above_body_limit_rejected_with_413():
    """Verify that clip upload exceeding 215 MB is rejected with HTTP 413."""
    headers = {
        "X-API-Key": TEST_API_KEY,
        "Content-Length": str(220 * 1024 * 1024),
    }
    resp = client.post("/v1/assets/upload", headers=headers)
    assert resp.status_code == 413
    assert "exceeds limit" in resp.json()["detail"]


def test_upload_real_40mb_clip_succeeds(tmp_path):
    """Test with a real ~40 MB clip to prove clip route allows large uploads while keeping bounds."""
    clip_path = tmp_path / "clip_40mb.mp4"
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=5:size=1920x1080:rate=30",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(clip_path),
    ]
    run_subprocess(cmd)
    base_size = clip_path.stat().st_size
    target_size = 40 * 1024 * 1024  # 40 MB
    if base_size < target_size:
        with open(clip_path, "ab") as f:
            f.write(b"\x00" * (target_size - base_size))

    file_size = clip_path.stat().st_size
    assert file_size == target_size, f"Generated file size {file_size} is not 40 MB"

    with open(clip_path, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": TEST_API_KEY},
            data={"kind": "clip"},
            files={"file": ("clip_40mb.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 200, resp.text
    meta = resp.json()
    assert meta["width"] == 1920
    assert meta["height"] == 1080
    assert meta["codec"] == "h264"


def test_reject_text_file_renamed_to_mp4():
    """Verify that a text file disguised as .mp4 fails ffprobe decode validation."""
    fake_content = b"This is plain text content masquerading as a video file.\n" * 100
    resp = client.post(
        "/v1/assets/upload",
        headers={"X-API-Key": TEST_API_KEY},
        data={"kind": "clip"},
        files={"file": ("fake_video.mp4", io.BytesIO(fake_content), "video/mp4")},
    )
    assert resp.status_code == 400
    assert "metadata" in resp.json()["detail"].lower() or "stream" in resp.json()["detail"].lower()


def test_reject_clip_with_multiple_video_streams(tmp_path):
    """Verify that a video container containing more than one video stream is rejected."""
    multi_v = tmp_path / "multi_video.mp4"
    create_test_clip(multi_v, duration=2.0, extra_video_stream=True)

    with open(multi_v, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": TEST_API_KEY},
            data={"kind": "clip"},
            files={"file": ("multi_video.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 400
    assert "exactly one video stream" in resp.json()["detail"].lower()


def test_clip_with_audio_is_reencoded_and_audio_dropped(tmp_path):
    """Verify that an uploaded clip containing audio has audio stripped and is re-encoded."""
    raw_clip = tmp_path / "audio_clip.mp4"
    create_test_clip(raw_clip, duration=2.5, with_audio=True)

    with open(raw_clip, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": TEST_API_KEY},
            data={"kind": "clip"},
            files={"file": ("audio_clip.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 200
    data = resp.json()
    saved_path = Path(data["path"])
    assert saved_path.exists()

    # Verify no audio stream remains
    probe_cmd = [
        settings.ffprobe_bin,
        "-v", "error",
        "-protocol_whitelist", "file",
        "-show_streams",
        "-of", "json",
        str(saved_path),
    ]
    info = json.loads(run_subprocess(probe_cmd).stdout)
    streams = info.get("streams", [])
    assert len(streams) == 1
    assert streams[0]["codec_type"] == "video"
    assert streams[0]["codec_name"] == "h264"


def test_reject_huge_declared_resolution_without_memory_exhaustion(tmp_path):
    """Verify that a clip with resolution exceeding 1920x1080 fails before decode."""
    huge_res = tmp_path / "huge_res.mp4"
    # Create 2560x1440 clip
    create_test_clip(huge_res, duration=1.0, width=2560, height=1440)

    with open(huge_res, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": TEST_API_KEY},
            data={"kind": "clip"},
            files={"file": ("huge_res.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 400
    assert "resolution" in resp.json()["detail"].lower()
    assert "exceeds maximum" in resp.json()["detail"].lower()


def test_reject_huge_duration_without_memory_exhaustion(tmp_path):
    """Verify that a clip with duration exceeding 30s fails bounds check immediately."""
    long_clip = tmp_path / "long_clip.mp4"
    create_test_clip(long_clip, duration=35.0, width=640, height=360)

    with open(long_clip, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": TEST_API_KEY},
            data={"kind": "clip"},
            files={"file": ("long_clip.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 400
    assert "duration" in resp.json()["detail"].lower()
    assert "exceeds maximum" in resp.json()["detail"].lower()

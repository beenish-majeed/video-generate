import io
import json
import subprocess
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.jobs import run_job, get_job
from src.models.schemas import JobState
from src.services.store import get_asset_path

client = TestClient(app, raise_server_exceptions=False)


def get_headers():
    return {"X-API-Key": settings.api_key or "test_key"}


def generate_synthetic_clip(output_path: Path, duration_s: float = 3.0, color: str = "blue", width: int = 1280, height: int = 720, fps: int = 30) -> Path:
    """Generate a clean synthetic H.264 test clip using ffmpeg lavfi color source."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c={color}:s={width}x{height}:r={fps}:d={duration_s}",
        "-vf", f"drawtext=text='Clip {color}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-t", str(duration_s),
        str(output_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return output_path


def probe_ffprobe_json(video_path: Path) -> dict:
    """Run ffprobe with json format output to verify streams, dimensions, and metadata tags."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        "-show_entries", "format_tags",
        str(video_path),
    ]
    res = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return json.loads(res.stdout)


def test_synthetic_clips_probe_and_validation(tmp_path):
    """Generate 5 synthetic clips and verify upload endpoint validation returns valid metadata."""
    headers = get_headers()
    colors = ["darkblue", "darkgreen", "darkred", "purple", "teal"]
    for i, col in enumerate(colors):
        p = tmp_path / f"test_clip_{i+1}.mp4"
        generate_synthetic_clip(p, duration_s=3.0, color=col)
        with open(p, "rb") as f:
            resp = client.post(
                "/v1/assets/upload",
                headers=headers,
                data={"kind": "clip"},
                files={"file": (f"test_clip_{i+1}.mp4", f, "video/mp4")},
            )
        assert resp.status_code == 200, resp.text
        meta = resp.json()
        assert meta["codec"] == "h264"
        assert meta["width"] == 1280
        assert meta["height"] == 720
        assert 2.9 <= meta["duration_seconds"] <= 3.2
        assert 29.0 <= meta["fps"] <= 31.0


def test_ai_clips_validation_failures(tmp_path):
    """Test validation failure cases: clip too long, unsupported codec, zero clips, missing consent."""
    headers = get_headers()

    # 1. Clip too long (>30s)
    long_clip = tmp_path / "long_clip.mp4"
    generate_synthetic_clip(long_clip, duration_s=32.0, color="black")
    with open(long_clip, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers=headers,
            data={"kind": "clip"},
            files={"file": ("long_clip.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 400
    assert "exceeds maximum allowed 30.0 seconds" in resp.text

    # 2. Unsupported codec (generate mpeg4 instead of h264/hevc/vp9/av1)
    unsupported_clip = tmp_path / "unsupported_codec.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=640x480:r=25:d=2",
        "-c:v", "mpeg4", str(unsupported_clip)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with open(unsupported_clip, "rb") as f:
        resp = client.post(
            "/v1/assets/upload",
            headers=headers,
            data={"kind": "clip"},
            files={"file": ("unsupported_codec.mp4", f, "video/mp4")},
        )
    assert resp.status_code == 400
    assert "Unsupported video codec 'mpeg4'" in resp.text

    # 3. Zero clips provided
    zero_clips_payload = {
        "visual_mode": "ai_clips",
        "clip_asset_ids": [],
        "voice_preset_id": "voice_piper_lessac",
        "script": (
            "Dawn breaks gently across the quiet mountain valley as morning arrives. "
            "A soft morning mist drifts gracefully over the still glass-like lake waters. "
            "Tall whispering pine trees stand peaceful and serene in the warm golden sunrise. "
            "A cool mountain breeze rustles the colorful autumn leaves along the forested trails. "
            "Wildflowers open their petals toward the sky in silent harmony. "
            "The entire natural world slowly awakens to a calm, restful, and beautiful new day."
        ),
        "duration_preset": "30s",
        "consent": {
            "authorized": True,
            "statement": "I have permission",
            "clips_rights_attested": True,
        },
    }
    resp = client.post("/v1/jobs", headers=headers, json=zero_clips_payload)
    assert resp.status_code in [400, 422]
    assert "must contain between 1 and 60 clips" in resp.text

    # 4. Missing clips rights consent
    valid_clip = tmp_path / "valid_clip_for_consent.mp4"
    generate_synthetic_clip(valid_clip, duration_s=2.0)
    with open(valid_clip, "rb") as f:
        up_resp = client.post(
            "/v1/assets/upload",
            headers=headers,
            data={"kind": "clip"},
            files={"file": ("valid_clip.mp4", f, "video/mp4")},
        )
    assert up_resp.status_code == 200
    valid_asset_id = up_resp.json()["asset_id"]

    no_consent_payload = {
        "visual_mode": "ai_clips",
        "clip_asset_ids": [valid_asset_id],
        "voice_preset_id": "voice_piper_lessac",
        "script": (
            "Dawn breaks gently across the quiet mountain valley as morning arrives. "
            "A soft morning mist drifts gracefully over the still glass-like lake waters. "
            "Tall whispering pine trees stand peaceful and serene in the warm golden sunrise. "
            "A cool mountain breeze rustles the colorful autumn leaves along the forested trails. "
            "Wildflowers open their petals toward the sky in silent harmony. "
            "The entire natural world slowly awakens to a calm, restful, and beautiful new day."
        ),
        "duration_preset": "30s",
        "consent": {
            "authorized": True,
            "statement": "I have permission",
            "clips_rights_attested": False,
        },
    }
    resp = client.post("/v1/jobs", headers=headers, json=no_consent_payload)
    assert resp.status_code == 400
    assert "clip rights" in resp.text.lower()


def test_ai_clips_e2e_full_job_without_music(tmp_path):
    """End-to-end API test: upload 5 synthetic clips, create ai_clips job, run to completion, probe output."""
    headers = get_headers()
    colors = ["navy", "forestgreen", "crimson", "indigo", "darkcyan"]

    # 1. Generate & Upload 5 clips via POST /v1/assets/upload
    clip_asset_ids = []
    for i, col in enumerate(colors):
        clip_path = tmp_path / f"synth_{i+1}.mp4"
        generate_synthetic_clip(clip_path, duration_s=3.5, color=col)
        with open(clip_path, "rb") as f:
            upload_resp = client.post(
                "/v1/assets/upload",
                headers=headers,
                data={"kind": "clip"},
                files={"file": (f"synth_{i+1}.mp4", f, "video/mp4")},
            )
        assert upload_resp.status_code == 200, upload_resp.text
        upload_data = upload_resp.json()
        assert "asset_id" in upload_data
        clip_asset_ids.append(upload_data["asset_id"])

    assert len(clip_asset_ids) == 5

    # 2. Create ai_clips job
    script_text = (
        "Dawn breaks gently across the quiet mountain valley as morning arrives. "
        "A soft morning mist drifts gracefully over the still glass-like lake waters. "
        "Tall whispering pine trees stand peaceful and serene in the warm golden sunrise. "
        "A cool mountain breeze rustles the colorful autumn leaves along the forested trails. "
        "Wildflowers open their petals toward the sky in silent harmony. "
        "The entire natural world slowly awakens to a calm, restful, and beautiful new day."
    )
    job_payload = {
        "visual_mode": "ai_clips",
        "clip_asset_ids": clip_asset_ids,
        "voice_preset_id": "voice_piper_lessac",
        "script": script_text,
        "duration_preset": "30s",
        "burn_subtitles": True,
        "consent": {
            "authorized": True,
            "statement": "I attest that I own or have rights to use all uploaded clips.",
            "clips_rights_attested": True,
            "ai_generated_accepted": True,
            "ai_label_accepted": True,
        },
    }

    create_resp = client.post("/v1/jobs", headers=headers, json=job_payload)
    assert create_resp.status_code == 202, create_resp.text
    job_data = create_resp.json()
    job_id = job_data["job_id"]
    assert job_id.startswith("job_")

    # 3. Wait for background execution to complete
    for _ in range(60):
        rec = get_job(job_id)
        if rec and rec.state in [JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED]:
            break
        time.sleep(0.5)

    final_job = get_job(job_id)
    assert final_job is not None
    assert final_job.state == JobState.COMPLETED, f"Job failed: {final_job.error}"
    assert final_job.output_path is not None

    output_path = Path(final_job.output_path)
    assert output_path.exists()
    assert output_path.stat().st_size > 50000

    # 4. Probe the final output video with ffprobe
    probe = probe_ffprobe_json(output_path)
    streams = probe.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    assert video_stream is not None, "Output video missing video stream"
    assert audio_stream is not None, "Output video missing audio stream"

    # Resolution: 1280x720
    assert video_stream["width"] == 1280
    assert video_stream["height"] == 720

    # Video Codec: h264
    assert video_stream["codec_name"] == "h264"

    # Audio Codec: aac
    assert audio_stream["codec_name"] == "aac"
    assert int(audio_stream["sample_rate"]) == 44100
    assert audio_stream["channels"] == 2

    # Provenance metadata tags
    format_tags = probe.get("format", {}).get("tags", {})
    tags_lower = {k.lower(): v for k, v in format_tags.items()}
    assert "ai" in tags_lower.get("artist", "").lower()
    assert "ai" in tags_lower.get("comment", "").lower() or "ai" in tags_lower.get("title", "").lower()

    # 5. Verify download endpoint
    dl_resp = client.get(f"/v1/jobs/{job_id}/download", headers=headers)
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "video/mp4"
    assert dl_resp.headers.get("x-content-type-options") == "nosniff"


def test_ai_clips_e2e_full_job_with_music_preset(tmp_path):
    """End-to-end API test with background music preset: verifies ducking and composition."""
    headers = get_headers()
    colors = ["saddlebrown", "darkolivegreen", "midnightblue", "darkmagenta", "darkslategray"]

    clip_asset_ids = []
    for i, col in enumerate(colors):
        clip_path = tmp_path / f"music_synth_{i+1}.mp4"
        generate_synthetic_clip(clip_path, duration_s=3.0, color=col)
        with open(clip_path, "rb") as f:
            upload_resp = client.post(
                "/v1/assets/upload",
                headers=headers,
                data={"kind": "clip"},
                files={"file": (f"music_synth_{i+1}.mp4", f, "video/mp4")},
            )
        assert upload_resp.status_code == 200
        clip_asset_ids.append(upload_resp.json()["asset_id"])

    job_payload = {
        "visual_mode": "ai_clips",
        "clip_asset_ids": clip_asset_ids,
        "voice_preset_id": "voice_piper_lessac",
        "music_preset_id": "calm",
        "music_volume": 0.2,
        "music_ducking": True,
        "script": (
            "Dawn breaks gently across the quiet mountain valley as morning arrives. "
            "A soft morning mist drifts gracefully over the still glass-like lake waters. "
            "Tall whispering pine trees stand peaceful and serene in the warm golden sunrise. "
            "A cool mountain breeze rustles the colorful autumn leaves along the forested trails. "
            "Wildflowers open their petals toward the sky in silent harmony. "
            "The entire natural world slowly awakens to a calm, restful, and beautiful new day."
        ),
        "duration_preset": "30s",
        "burn_subtitles": True,
        "consent": {
            "authorized": True,
            "statement": "I attest that I own or have rights to use all uploaded clips.",
            "clips_rights_attested": True,
            "ai_generated_accepted": True,
            "ai_label_accepted": True,
        },
    }

    create_resp = client.post("/v1/jobs", headers=headers, json=job_payload)
    assert create_resp.status_code == 202
    job_id = create_resp.json()["job_id"]

    for _ in range(60):
        rec = get_job(job_id)
        if rec and rec.state in [JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED]:
            break
        time.sleep(0.5)

    final_job = get_job(job_id)
    assert final_job is not None
    assert final_job.state == JobState.COMPLETED, f"Job failed: {final_job.error}"
    assert final_job.music_applied is True
    assert final_job.output_path is not None

    output_path = Path(final_job.output_path)
    assert output_path.exists()
    probe = probe_ffprobe_json(output_path)
    audio_stream = next((s for s in probe["streams"] if s.get("codec_type") == "audio"), None)
    assert audio_stream is not None
    assert audio_stream["codec_name"] == "aac"

import io
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import CompiledPlan, ConsentRequest, JobCreate, SafetyParams, SubtitleParams, VoiceParams
from src.services.clip_compositor import ClipCompositor
from src.services.jobs import create_job
from src.services.store import get_asset_path, save_upload
from src.utils.ffmpeg import probe_duration
from src.utils.subprocess_runner import run_subprocess

client = TestClient(app)
SECURE_TEST_KEY = "test_cryptographic_secret_key_123456"


@pytest.fixture(autouse=True)
def dev_mode_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)


def create_synthetic_mp4(
    path: Path,
    duration: float = 2.0,
    width: int = 640,
    height: int = 360,
    fps: int = 25,
    codec: str = "libx264",
    with_audio: bool = False,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", f"testsrc=duration={duration}:size={width}x{height}:rate={fps}",
    ]
    if with_audio:
        cmd.extend(["-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}"])
        cmd.extend(["-c:a", "aac"])
    cmd.extend([
        "-c:v", codec,
        "-pix_fmt", "yuv420p",
        str(path),
    ])
    res = run_subprocess(cmd)
    if res.returncode != 0:
        raise RuntimeError(f"Failed to generate synthetic mp4: {res.stderr}")
    return path


def create_synthetic_wav(path: Path, duration: float = 3.0) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    import wave
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * int(duration * 16000))
    return path


class TestClipUploadValidation:
    def test_upload_valid_clip_strips_audio_and_metadata(self, tmp_path):
        raw_clip = tmp_path / "source_with_audio.mp4"
        create_synthetic_mp4(raw_clip, duration=3.0, width=1280, height=720, fps=30, with_audio=True)

        with open(raw_clip, "rb") as f:
            response = client.post(
                "/v1/assets/upload",
                data={"kind": "clip"},
                files={"file": ("scene_001.mp4", f, "video/mp4")},
                headers={"X-API-Key": SECURE_TEST_KEY},
            )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["kind"] == "clip"
        assert data["asset_id"].startswith("clip_")
        assert data["duration_seconds"] == pytest.approx(3.0, abs=0.2)
        assert data["width"] == 1280
        assert data["height"] == 720
        assert data["fps"] == 30.0

        # Verify uploaded asset on disk has audio stripped
        saved_path = Path(data["path"])
        assert saved_path.exists()
        probe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "json",
            str(saved_path),
        ]
        res = run_subprocess(probe_cmd)
        probe_info = json.loads(res.stdout)
        assert len(probe_info.get("streams", [])) == 0, "Audio stream should have been stripped."

    def test_upload_corrupt_clip_rejected(self):
        fake_bytes = b"not a valid mp4 header or video stream at all"
        response = client.post(
            "/v1/assets/upload",
            data={"kind": "clip"},
            files={"file": ("corrupt.mp4", io.BytesIO(fake_bytes), "video/mp4")},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 400
        assert "metadata" in response.json()["detail"].lower() or "video stream" in response.json()["detail"].lower()

    def test_upload_clip_exceeding_duration_rejected(self, tmp_path):
        long_clip = tmp_path / "long_clip.mp4"
        create_synthetic_mp4(long_clip, duration=35.0, width=640, height=360, fps=25)

        with open(long_clip, "rb") as f:
            response = client.post(
                "/v1/assets/upload",
                data={"kind": "clip"},
                files={"file": ("too_long.mp4", f, "video/mp4")},
                headers={"X-API-Key": SECURE_TEST_KEY},
            )
        assert response.status_code == 400
        assert "exceeds maximum allowed 30.0 seconds" in response.json()["detail"]


class TestClipCompositorStandardize:
    def test_standardize_shorter_clip_slowdown_and_hold(self, tmp_path):
        short_clip = tmp_path / "short_2s.mp4"
        create_synthetic_mp4(short_clip, duration=2.0, width=704, height=480, fps=24)

        out_clip = tmp_path / "std_4s.mp4"
        # 2s clip stretched to 4s: ratio = 2.0 > 1.25 -> slow down by 1.25x and hold remaining
        ClipCompositor.standardize_clip(short_clip, target_visual_duration=4.0, output_path=out_clip)

        assert out_clip.exists()
        dur = probe_duration(out_clip)
        assert dur == pytest.approx(4.0, abs=0.1)

        # Check resolution 1280x720 and 30fps
        probe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "json",
            str(out_clip),
        ]
        info = json.loads(run_subprocess(probe_cmd).stdout)
        vst = info["streams"][0]
        assert vst["width"] == 1280
        assert vst["height"] == 720
        assert vst["r_frame_rate"] == "30/1"

    def test_standardize_longer_clip_trimmed(self, tmp_path):
        long_clip = tmp_path / "long_5s.mp4"
        create_synthetic_mp4(long_clip, duration=5.0, width=1920, height=1080, fps=30)

        out_clip = tmp_path / "std_3s.mp4"
        ClipCompositor.standardize_clip(long_clip, target_visual_duration=3.0, output_path=out_clip)

        assert out_clip.exists()
        dur = probe_duration(out_clip)
        assert dur == pytest.approx(3.0, abs=0.1)


class TestAiClipsJobCreationAndConsent:
    def test_create_ai_clips_job_success(self, tmp_path, monkeypatch):
        # Set up storage assets
        assets_dir = tmp_path / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(settings, "storage_dir", tmp_path)
        monkeypatch.setattr("src.services.store.ASSETS_DIR", assets_dir)

        c1 = assets_dir / "clip_001.mp4"
        create_synthetic_mp4(c1, duration=3.0)
        c2 = assets_dir / "clip_002.mp4"
        create_synthetic_mp4(c2, duration=3.0)

        v1 = assets_dir / "voice_narration.wav"
        create_synthetic_wav(v1, duration=6.0)

        job_req = JobCreate(
            visual_mode="ai_clips",
            clip_asset_ids=["clip_001", "clip_002"],
            uploaded_audio_asset_id="voice_narration",
            script="First scene text here. Second scene text following.",
            consent=ConsentRequest(
                authorized=True,
                clips_rights_attested=True,
                ai_generated_accepted=True,
                statement="I own and authorize the use of these AI generated clips for video creation.",
            ),
        )

        job_record = create_job(job_req)
        assert job_record.job_id.startswith("job_")
        assert job_record.consent.authorized is True
        assert len(job_record.clip_asset_ids) == 2
        assert job_record.estimated_render_seconds > 0

    def test_create_ai_clips_job_unauthorized_consent_fails(self, tmp_path, monkeypatch):
        assets_dir = tmp_path / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(settings, "storage_dir", tmp_path)
        monkeypatch.setattr("src.services.store.ASSETS_DIR", assets_dir)

        c1 = assets_dir / "clip_001.mp4"
        create_synthetic_mp4(c1, duration=3.0)

        job_req = JobCreate(
            visual_mode="ai_clips",
            clip_asset_ids=["clip_001"],
            voice_preset_id="voice_piper_lessac",
            script="Short scene.",
            consent=ConsentRequest(
                authorized=False,
                statement="I own and authorize these clips.",
            ),
        )

        with pytest.raises(ValueError, match="Authorization is required"):
            create_job(job_req)

    def test_create_ai_clips_job_zero_clips_validation_error(self):
        with pytest.raises(ValueError, match="clip_asset_ids must contain between 1 and 60 clips"):
            JobCreate(
                visual_mode="ai_clips",
                clip_asset_ids=[],
                voice_preset_id="voice_piper_lessac",
                script="Short scene.",
                consent=ConsentRequest(
                    authorized=True,
                    statement="I own and authorize these clips.",
                ),
            )


class TestAiClipsFullCompositorAssembly:
    def test_compose_clips_job_end_to_end(self, tmp_path):
        job_dir = tmp_path / "job_test_assembly"
        job_dir.mkdir(parents=True, exist_ok=True)

        clip1 = tmp_path / "clip_raw_1.mp4"
        create_synthetic_mp4(clip1, duration=2.5, width=640, height=360, fps=25)
        clip2 = tmp_path / "clip_raw_2.mp4"
        create_synthetic_mp4(clip2, duration=3.5, width=704, height=480, fps=25)

        speech1 = tmp_path / "speech_1.wav"
        create_synthetic_wav(speech1, duration=3.0)
        speech2 = tmp_path / "speech_2.wav"
        create_synthetic_wav(speech2, duration=3.0)

        dummy_plan = CompiledPlan(
            job_id="job_comp_123",
            prompt_original="Prompt original text",
            script="Scene one narration. Scene two narration.",
            target_duration_seconds=6.0,
            duration_source="prompt",
            language="en-US",
            voice=VoiceParams(speed=1.0),
            safety=SafetyParams(label_text="AI-generated"),
            subtitles=SubtitleParams(burn_in=True, enabled=True),
        )

        output_video, sub_path = ClipCompositor.compose_clips_job(
            job_path=job_dir,
            plan=dummy_plan,
            clip_paths=[clip1, clip2],
            scene_durations=[3.0, 3.0],
            scene_audio_paths=[speech1, speech2],
            scene_texts=["Scene one narration.", "Scene two narration."],
            burn_subtitles=True,
            subtitles_enabled=True,
        )

        assert output_video.exists()
        assert output_video.stat().st_size > 10000

        # Verify probe duration: 3.0 + 3.0 + 0.5s tail = 6.5s
        final_dur = probe_duration(output_video)
        assert final_dur == pytest.approx(6.5, abs=0.2)

        # Verify streams: 1 video (1280x720, 30fps), 1 audio (stereo AAC)
        probe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate:format_tags",
            "-of", "json",
            str(output_video),
        ]
        info = json.loads(run_subprocess(probe_cmd).stdout)
        streams = info.get("streams", [])
        assert len(streams) >= 2

        v_st = [s for s in streams if s["codec_type"] == "video"][0]
        assert v_st["width"] == 1280
        assert v_st["height"] == 720
        assert v_st["r_frame_rate"] == "30/1"

        a_st = [s for s in streams if s["codec_type"] == "audio"][0]
        assert a_st["codec_name"] == "aac"
        assert a_st["channels"] == 2
        assert a_st["sample_rate"] == "44100"

        # Verify provenance metadata tags
        tags = info.get("format", {}).get("tags", {})
        tags_lower = {k.lower(): v.lower() for k, v in tags.items()}
        assert "ai-generated" in tags_lower.get("comment", "") or "synthetic" in tags_lower.get("comment", "")

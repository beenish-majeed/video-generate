import io
import wave
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.llm import FakeLLMProvider
from src.services.scene_planner import (
    ALLOWED_STYLES,
    CAMERA_MOVEMENTS,
    DEFAULT_NEGATIVE_PROMPT,
    LIGHTING_STYLES,
    build_clip_scene_plan,
    build_scene_visual_prompt,
)

client = TestClient(app)
SECURE_TEST_KEY = "test_cryptographic_secret_key_123456"


@pytest.fixture(autouse=True)
def dev_mode_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)


def create_test_wav_bytes(duration_seconds: float = 10.0, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        num_frames = int(duration_seconds * sample_rate)
        wf.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


class TestScenePlansAPI:
    def test_create_scene_plan_json_success(self):
        script = (
            "The morning sun slowly crested over the quiet misty mountains. "
            "A gentle stream flowed peacefully through the ancient pine forest below. "
            "Wild birds sang their earliest melodies across the meadow."
        )
        response = client.post(
            "/v1/scene-plans",
            json={"script": script, "style": "cinematic"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200, response.text
        data = response.json()

        assert data["plan_id"].startswith("plan_")
        assert data["style"] == "cinematic"
        assert data["total_duration_seconds"] > 0
        assert len(data["scenes"]) >= 2
        assert "Scene 1" in data["plain_text_prompts"]

        for idx, scene in enumerate(data["scenes"]):
            expected_id = f"scene_{idx+1:03d}"
            assert scene["id"] == expected_id
            assert scene["scene_index"] == idx
            assert len(scene["narration"]) > 0
            assert len(scene["visual_prompt"]) > 0
            assert scene["negative_prompt"] == DEFAULT_NEGATIVE_PROMPT
            assert scene["target_clip_seconds"] > 0
            assert scene["aspect_ratio"] == "16:9"

    def test_create_scene_plan_format_text_query(self):
        script = "A lonely beacon flashed across the stormy coastline. Waves crashed against jagged rocks."
        response = client.post(
            "/v1/scene-plans?format=text",
            json={"script": script, "style": "watercolor"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")
        body = response.text
        assert "Scene 1 (scene_001" in body
        assert "Narration:" in body
        assert "Prompt:" in body
        assert "Negative:" in body

    def test_create_scene_plan_format_text_header(self):
        script = "The night sky filled with countless twinkling stars above the desert."
        response = client.post(
            "/v1/scene-plans",
            json={"script": script, "style": "photo"},
            headers={"X-API-Key": SECURE_TEST_KEY, "Accept": "text/plain"},
        )
        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")
        assert "Scene 1 (scene_001" in response.text

    def test_create_scene_plan_with_audio_asset_alignment(self, tmp_path, monkeypatch):
        # Place a real 12.0s wav file in assets dir
        assets_dir = tmp_path / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(settings, "storage_dir", tmp_path)
        monkeypatch.setattr("src.services.store.ASSETS_DIR", assets_dir)

        wav_bytes = create_test_wav_bytes(duration_seconds=12.0)
        wav_file = assets_dir / "voice_test_asset.wav"
        wav_file.write_bytes(wav_bytes)

        script = (
            "Step one is opening the terminal and checking system status. "
            "Step two requires compiling the backend code cleanly. "
            "Step three confirms that all unit tests are passing."
        )
        response = client.post(
            "/v1/scene-plans",
            json={
                "script": script,
                "style": "cinematic",
                "audio_asset_id": "voice_test_asset",
            },
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200, response.text
        data = response.json()

        assert data["total_duration_seconds"] == pytest.approx(12.0, abs=0.1)
        durations = [s["target_clip_seconds"] for s in data["scenes"]]
        assert sum(durations) == pytest.approx(12.0, abs=0.1)
        assert len(data["scenes"]) >= 2

    def test_create_scene_plan_with_target_duration(self):
        script = (
            "First we explore the ancient ruins deep in the misty valley. "
            "Then we discover secret inscriptions carved on the granite stone. "
            "Finally the path opens to an astonishing mountain view."
        )
        response = client.post(
            "/v1/scene-plans",
            json={
                "script": script,
                "style": "flat illustration",
                "target_duration_seconds": 30.0,
            },
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["total_duration_seconds"] == pytest.approx(30.0, abs=0.05)
        sum_durations = sum(s["target_clip_seconds"] for s in data["scenes"])
        assert sum_durations == pytest.approx(30.0, abs=0.05)

    def test_create_scene_plan_safety_blocklist_sanitized(self):
        unsafe_script = "A horrifying violent massacre with murder and bloody weapons everywhere."
        response = client.post(
            "/v1/scene-plans",
            json={"script": unsafe_script, "style": "cinematic"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        for scene in data["scenes"]:
            prompt_lower = scene["visual_prompt"].lower()
            assert "murder" not in prompt_lower
            assert "bloody" not in prompt_lower
            assert "weapons" not in prompt_lower
            assert "peaceful scenic landscape" in prompt_lower

    def test_create_scene_plan_deterministic_with_fake_llm(self):
        fake_llm = FakeLLMProvider(canned_response="A crystal lake reflecting snowy peaks at dawn")
        plan = build_clip_scene_plan(
            script="The clear waters rested undisturbed in the early morning breeze.",
            style="cinematic",
            llm_provider=fake_llm,
        )
        assert len(plan.scenes) > 0
        first_prompt = plan.scenes[0].visual_prompt
        assert "A crystal lake reflecting snowy peaks at dawn" in first_prompt
        assert CAMERA_MOVEMENTS[0] in first_prompt
        assert LIGHTING_STYLES[0] in first_prompt
        assert ALLOWED_STYLES["cinematic"] in first_prompt

    def test_create_scene_plan_missing_audio_asset_404(self):
        response = client.post(
            "/v1/scene-plans",
            json={"script": "Short script here.", "audio_asset_id": "missing_asset_123"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_scene_plan_validation_empty_script(self):
        response = client.post(
            "/v1/scene-plans",
            json={"script": "   "},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 422

    def test_create_scene_plan_validation_invalid_style(self):
        response = client.post(
            "/v1/scene-plans",
            json={"script": "Valid script text.", "style": "invalid_cyberpunk_neon"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 422

    def test_create_scene_plan_validation_excessive_script(self):
        long_script = "Word " * 1200
        response = client.post(
            "/v1/scene-plans",
            json={"script": long_script},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 422

    def test_create_scene_plan_auth_required_in_production(self, monkeypatch):
        monkeypatch.setattr(settings, "api_key", SECURE_TEST_KEY)
        monkeypatch.setattr(settings, "allow_insecure_dev", False)
        # Without header
        response = client.post(
            "/v1/scene-plans",
            json={"script": "Valid script text.", "style": "cinematic"},
        )
        assert response.status_code == 401

        # With invalid header
        response = client.post(
            "/v1/scene-plans",
            json={"script": "Valid script text.", "style": "cinematic"},
            headers={"X-API-Key": "wrong_key"},
        )
        assert response.status_code == 401

        # With correct header
        response = client.post(
            "/v1/scene-plans",
            json={"script": "Valid script text.", "style": "cinematic"},
            headers={"X-API-Key": SECURE_TEST_KEY},
        )
        assert response.status_code == 200

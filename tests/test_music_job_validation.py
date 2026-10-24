import io
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import create_job

client = TestClient(app)


@pytest.fixture(autouse=True)
def auth_setup(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "test_key_music_job_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    monkeypatch.setattr("src.main.JOB_EXECUTOR.submit", lambda fn, *args: None)


@pytest.fixture
def base_valid_payload(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
    # Create valid dummy photo and voice assets in store
    photo_file = tmp_path / "photo_job_test.png"
    photo_file.write_bytes(b"dummy photo bytes")
    voice_file = tmp_path / "voice_job_test.wav"
    voice_file.write_bytes(b"dummy voice bytes")

    # Also create a valid dummy music asset
    music_file = tmp_path / "music_asset_001.mp3"
    music_file.write_bytes(b"dummy music bytes")

    return {
        "photo_asset_id": "photo_job_test",
        "voice_asset_id": "voice_job_test",
        "script": "Hello world, this is a test script for video generation with music.",
        "prompt": "5 second video",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": True,
            "statement": "I have full consent and authorization.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
        },
    }


class TestMusicJobValidation:
    def test_job_schema_has_rights_disclaimer(self):
        doc = JobCreate.__doc__ or ""
        assert "rights" in doc.lower()
        field_desc = JobCreate.model_fields["music_asset_id"].description or ""
        assert "rights" in field_desc.lower()

    def test_default_music_values(self, base_valid_payload):
        req = JobCreate(**base_valid_payload)
        assert req.music_asset_id is None
        assert req.music_volume == 0.25
        assert req.music_ducking is True

    def test_valid_music_job_accepted(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["music_asset_id"] = "music_asset_001"
        payload["music_volume"] = 0.35
        payload["music_ducking"] = False

        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=payload,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["job_id"].startswith("job_")

    def test_unknown_music_asset_returns_422(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["music_asset_id"] = "music_unknown_999"

        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=payload,
        )
        assert resp.status_code == 422
        errors = resp.json().get("detail", [])
        assert any("music_asset_id" in str(err) for err in errors)

    def test_path_traversal_music_asset_returns_422(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["music_asset_id"] = "../../etc/passwd"

        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=payload,
        )
        assert resp.status_code == 422
        errors = resp.json().get("detail", [])
        assert any("music_asset_id" in str(err) for err in errors)

    def test_music_volume_below_zero_returns_422(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["music_asset_id"] = "music_asset_001"
        payload["music_volume"] = -0.05

        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=payload,
        )
        assert resp.status_code == 422
        errors = resp.json().get("detail", [])
        assert any("music_volume" in str(err) for err in errors)

    def test_music_volume_above_one_returns_422(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["music_asset_id"] = "music_asset_001"
        payload["music_volume"] = 1.2

        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=payload,
        )
        assert resp.status_code == 422
        errors = resp.json().get("detail", [])
        assert any("music_volume" in str(err) for err in errors)

    def test_backward_compatibility_bg_music_alias(self, base_valid_payload):
        payload = dict(base_valid_payload)
        payload["bg_music_asset_id"] = "music_asset_001"
        payload["bg_music_volume"] = 0.4

        req = JobCreate(**payload)
        assert req.music_asset_id == "music_asset_001"
        assert req.music_volume == 0.4

    def test_job_without_music_behaves_normally(self, base_valid_payload):
        resp = client.post(
            "/v1/jobs",
            headers={"X-API-Key": "test_key_music_job_123"},
            json=base_valid_payload,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["job_id"].startswith("job_")

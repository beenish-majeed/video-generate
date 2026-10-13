import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import create_job

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_api_auth(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "test_key_presets_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)
    monkeypatch.setattr("src.main.JOB_EXECUTOR.submit", lambda fn, *args: None)


class TestPresetsAPI:
    def test_get_presets_returns_avatars_and_voices(self):
        resp = client.get("/v1/presets", headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "avatars" in data
        assert "voices" in data
        assert len(data["avatars"]) >= 1
        assert len(data["voices"]) >= 1

        avatar = data["avatars"][0]
        assert "id" in avatar
        assert "name" in avatar
        assert "thumbnail_url" in avatar
        assert avatar["thumbnail_url"].startswith("/v1/presets/avatars/")

        voice = data["voices"][0]
        assert "id" in voice
        assert "name" in voice

    def test_get_avatar_thumbnail_success(self):
        resp = client.get("/v1/presets", headers={"X-API-Key": "test_key_presets_123"})
        avatar_id = resp.json()["avatars"][0]["id"]

        thumb_resp = client.get(
            f"/v1/presets/avatars/{avatar_id}/thumbnail",
            headers={"X-API-Key": "test_key_presets_123"},
        )
        assert thumb_resp.status_code == 200
        assert thumb_resp.headers["content-type"] in ["image/jpeg", "image/png"]
        assert len(thumb_resp.content) > 0

    def test_get_avatar_thumbnail_unknown_returns_404(self):
        thumb_resp = client.get(
            "/v1/presets/avatars/non_existent_avatar_999/thumbnail",
            headers={"X-API-Key": "test_key_presets_123"},
        )
        assert thumb_resp.status_code == 404


class TestJobPresetsAndConsent:
    def test_prompt_path_with_valid_preset_ids_and_consent(self):
        long_script = " ".join(["word"] * 80)
        payload = {
            "avatar_preset_id": "avatar_default",
            "voice_preset_id": "voice_piper_lessac",
            "script": long_script,
            "prompt": "Create an introductory AI video",
            "target_duration_seconds": 30.0,
            "consent": {
                "authorized": True,
                "statement": "I understand and accept that this video is AI-generated and will display an AI label.",
                "ai_generated_accepted": True,
            },
        }
        resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 202
        data = resp.json()
        assert data["job_id"].startswith("job_")
        assert data["state"] == "CONSENT_VERIFIED"

    def test_unknown_avatar_preset_id_returns_422(self):
        long_script = " ".join(["word"] * 80)
        payload = {
            "avatar_preset_id": "unknown_avatar_xyz",
            "voice_preset_id": "voice_piper_lessac",
            "script": long_script,
            "prompt": "AI video",
            "target_duration_seconds": 30.0,
            "consent": {
                "authorized": True,
                "statement": "I accept that this video is AI-generated with an AI label.",
                "ai_generated_accepted": True,
            },
        }
        resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 422
        assert "Unknown avatar_preset_id" in resp.json()["detail"][0]["msg"]

    def test_path_traversal_attempt_in_preset_id_returns_422(self):
        long_script = " ".join(["word"] * 80)
        payload = {
            "avatar_preset_id": "../../.env",
            "voice_preset_id": "voice_piper_lessac",
            "script": long_script,
            "prompt": "Path traversal attack",
            "target_duration_seconds": 30.0,
            "consent": {
                "authorized": True,
                "statement": "I accept that this video is AI-generated with an AI label.",
                "ai_generated_accepted": True,
            },
        }
        resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 422
        assert "Unknown avatar_preset_id" in resp.json()["detail"][0]["msg"]

    def test_prompt_path_missing_ai_generated_acceptance_fails(self):
        long_script = " ".join(["word"] * 80)
        payload = {
            "avatar_preset_id": "avatar_default",
            "voice_preset_id": "voice_piper_lessac",
            "script": long_script,
            "prompt": "Prompt path missing ai acceptance",
            "target_duration_seconds": 30.0,
            "consent": {
                "authorized": True,
                "statement": "I accept that this video is AI-generated with an AI label.",
                # ai_generated_accepted is missing/None
            },
        }
        resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 400
        assert "Acceptance that the video is AI-generated" in resp.json()["detail"]

    def test_prompt_path_does_not_require_face_or_voice_rights(self):
        long_script = " ".join(["word"] * 80)
        consent = ConsentRequest(
            authorized=True,
            statement="I acknowledge this video is AI-generated and will display an AI label.",
            face_rights_attested=None,
            voice_rights_attested=None,
            ai_generated_accepted=True,
        )
        req = JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            script=long_script,
            target_duration_seconds=30.0,
            consent=consent,
        )
        job = create_job(req)
        assert job.consent is not None
        assert job.consent.authorized is True

    def test_upload_flow_still_passes_with_ownership_attestation(self):
        long_script = " ".join(["word"] * 80)
        consent = ConsentRequest(
            authorized=True,
            statement="I authorize this video generation and own all rights to face and voice.",
            face_rights_attested=True,
            voice_rights_attested=True,
        )
        req = JobCreate(
            photo_asset_id="photo_test_eval",
            voice_asset_id="voice_test_eval",
            script=long_script,
            target_duration_seconds=30.0,
            consent=consent,
        )
        job = create_job(req)
        assert job.job_id.startswith("job_")
        assert job.photo_path.endswith("photo_test_eval.jpg")

    def test_upload_flow_fails_if_face_rights_missing(self):
        long_script = " ".join(["word"] * 80)
        payload = {
            "photo_asset_id": "photo_test_eval",
            "voice_asset_id": "voice_test_eval",
            "script": long_script,
            "target_duration_seconds": 30.0,
            "consent": {
                "authorized": True,
                "statement": "I authorize this video generation and own all rights.",
                "face_rights_attested": False,
                "voice_rights_attested": True,
            },
        }
        resp = client.post("/v1/jobs", json=payload, headers={"X-API-Key": "test_key_presets_123"})
        assert resp.status_code == 400
        assert "Face rights attestation is required" in resp.json()["detail"]

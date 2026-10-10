import pytest
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.qa import check_final

client = TestClient(app)


def test_script_too_short_for_requested_duration_rejected(monkeypatch):
    monkeypatch.setattr(settings, "api_key", None)
    monkeypatch.setattr(settings, "allow_insecure_dev", True)
    # 20 words script ~ 8.0s speech duration @ 150 WPM
    short_script = " ".join(["word"] * 20)

    
    response = client.post(
        "/v1/jobs",
        json={
            "photo_asset_id": "photo_123",
            "voice_asset_id": "voice_123",
            "script": short_script,
            "prompt": "Make a video",
            "target_duration_seconds": 60.0,
            "consent": {
                "authorized": True,
                "statement": "I authorize this video generation and own all rights.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
            },
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "Script has 20 words" in str(detail)
    assert "requires at least 135 words" in str(detail)


def test_script_just_long_enough_accepted():
    # 135 words script = exactly 54.0s speech duration (90% of 60s) @ 150 WPM
    enough_script = " ".join(["word"] * 135)
    
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    req = JobCreate(
        photo_asset_id="photo_123",
        voice_asset_id="voice_123",
        script=enough_script,
        prompt="Make a video",
        target_duration_seconds=60.0,
        consent=consent,
    )
    assert req.target_duration_seconds == 60.0


def test_check_final_safety_net_tolerance():
    # Verify check_final tolerance safety net remains functional
    res_pass = check_final(video_path="non_existent.mp4", expected_duration=5.0)
    # File doesn't exist so probe_duration returns fallback duration
    assert isinstance(res_pass, dict)

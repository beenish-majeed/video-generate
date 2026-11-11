import io
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.utils.ffmpeg import make_tone_wav

API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def test_cross_session_audio_asset_in_scene_plan_blocked(tmp_path):
    client_a = TestClient(app)
    client_b = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}

    # 1. Visitor A uploads a private audio track
    audio_path = tmp_path / "private_tone.wav"
    make_tone_wav(audio_path, seconds=6.0, freq=440, volume=0.05)

    with audio_path.open("rb") as f:
        resp_up = client_a.post(
            "/v1/assets/upload",
            headers=auth_headers,
            data={"kind": "audio"},
            files={"file": ("private_tone.wav", f, "audio/wav")},
        )
    assert resp_up.status_code == 200, resp_up.text
    audio_asset_id = resp_up.json()["asset_id"]

    # 2. Visitor B attempts to use Visitor A's private audio in POST /v1/scene-plans -> 403 Forbidden
    payload_b = {
        "script": "A cinematic exploration of mysterious celestial phenomena in deep outer space.",
        "audio_asset_id": audio_asset_id,
        "style": "cinematic",
    }
    resp_b = client_b.post("/v1/scene-plans", json=payload_b, headers=auth_headers)
    assert resp_b.status_code == 403
    assert "Access denied" in resp_b.json()["detail"]

    # 3. Visitor A uses their own audio in POST /v1/scene-plans -> 200 OK
    resp_a = client_a.post("/v1/scene-plans", json=payload_b, headers=auth_headers)
    assert resp_a.status_code == 200
    assert "scenes" in resp_a.json()

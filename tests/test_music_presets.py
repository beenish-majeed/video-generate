import io
import wave
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
import numpy as np

from src.main import app
from src.models.schemas import JobCreate, ConsentRequest
from src.services.music_presets import (
    get_music_presets,
    is_valid_music_preset_id,
    synthesize_preset_audio,
    get_preset_path,
    resolve_job_music_path,
    MUSIC_PRESETS,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_music_presets_allowlist():
    presets = get_music_presets()
    assert len(presets) == 3
    ids = [p["id"] for p in presets]
    assert "calm" in ids
    assert "warm" in ids
    assert "bright" in ids

    # Allowlist validator
    assert is_valid_music_preset_id("calm")
    assert is_valid_music_preset_id("warm")
    assert is_valid_music_preset_id("bright")
    assert is_valid_music_preset_id("music_ambient_calm")
    assert not is_valid_music_preset_id("rock_metal_synth")
    assert not is_valid_music_preset_id("../../../etc/passwd")


def test_music_preset_deterministic_output():
    audio1 = synthesize_preset_audio("calm", duration=5.0)
    audio2 = synthesize_preset_audio("calm", duration=5.0)
    assert audio1 == audio2, "Music preset synthesis must be 100% deterministic"

    # Different presets produce different audio
    audio_warm = synthesize_preset_audio("warm", duration=5.0)
    assert audio1 != audio_warm


def test_music_preset_audio_format_and_duration():
    target_dur = 6.0
    sr = 44100
    audio_bytes = synthesize_preset_audio("bright", duration=target_dur, sample_rate=sr)

    with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
        assert wf.getnchannels() == 2, "Audio must be stereo (2 channels)"
        assert wf.getsampwidth() == 2, "Audio must be 16-bit PCM"
        assert wf.getframerate() == sr, "Sample rate must be 44.1 kHz"
        actual_dur = wf.getnframes() / float(sr)
        assert abs(actual_dur - target_dur) < 0.01, f"Duration mismatch: {actual_dur:.3f} vs {target_dur}"


def test_music_preset_loopability():
    # Loopability: when the audio wraps around from end to start,
    # the jump between the last sample and first sample must be minimal (< 0.05 normalized amplitude)
    audio_bytes = synthesize_preset_audio("calm", duration=10.0, sample_rate=44100)
    with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    samples = np.frombuffer(frames, dtype=np.int16).reshape(-1, 2) / 32768.0

    # Test left and right channel discontinuities
    left_jump = abs(samples[0, 0] - samples[-1, 0])
    right_jump = abs(samples[0, 1] - samples[-1, 1])

    assert left_jump < 0.05, f"Left channel loop discontinuity too large: {left_jump}"
    assert right_jump < 0.05, f"Right channel loop discontinuity too large: {right_jump}"


def test_get_preset_path_caches_under_storage(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.music_presets.settings.storage_dir", tmp_path / "storage")
    p1 = get_preset_path("calm", duration=5.0)
    assert p1 is not None
    assert p1.exists()
    assert "storage" in str(p1).lower()

    # Second call returns cached file
    p2 = get_preset_path("calm", duration=5.0)
    assert p1 == p2


def test_unknown_preset_returns_none_and_never_builds_path():
    assert get_preset_path("unknown_invalid_mood") is None
    assert get_preset_path("../../../secrets") is None


def test_music_preset_api_endpoint(client):
    from src.config import settings
    headers = {"X-API-Key": settings.api_key} if settings.api_key else {}
    res = client.get("/v1/music-presets", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 3
    preset_ids = {item["id"] for item in data}
    assert preset_ids == {"calm", "warm", "bright"}


def test_job_validation_rejects_unknown_preset_id():
    with pytest.raises(ValidationError) as exc:
        JobCreate(
            photo_asset_id="photo_valid",
            voice_asset_id="voice_valid",
            script="Hello world this is a test for invalid music preset rejection.",
            prompt="test",
            music_preset_id="electronic_techno_bad",
            consent=ConsentRequest(
                authorized=True,
                statement="I authorize this video generation and own all rights.",
                face_rights_attested=True,
                voice_rights_attested=True,
            ),
        )
    assert "Unknown music_preset_id" in str(exc.value)


def test_job_validation_rejects_both_asset_and_preset_ids(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
    music_file = tmp_path / "my_music.mp3"
    music_file.write_bytes(b"dummy")

    with pytest.raises(ValidationError) as exc:
        JobCreate(
            photo_asset_id="photo_valid",
            voice_asset_id="voice_valid",
            script="Hello world this is a test for mutual exclusion of music asset and preset.",
            prompt="test",
            music_asset_id="my_music",
            music_preset_id="calm",
            consent=ConsentRequest(
                authorized=True,
                statement="I authorize this video generation and own all rights.",
                face_rights_attested=True,
                voice_rights_attested=True,
            ),
        )
    assert "Providing both" in str(exc.value)

import pytest
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import create_job
from src.services.prompt_compiler import compile_plan

client = TestClient(app)


def test_get_durations_endpoint():
    response = client.get("/v1/durations")
    assert response.status_code == 200
    data = response.json()
    assert "words_per_minute" in data
    assert "min_duration_seconds" in data
    assert "max_duration_policy_seconds" in data
    assert "allowed_presets" in data
    preset_values = [p["value"] for p in data["allowed_presets"]]
    assert "5s" in preset_values
    assert "30s" in preset_values
    assert "2m" in preset_values
    assert "5m" in preset_values
    assert "10m" in preset_values


def test_valid_preset():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    long_script = " ".join(["word"] * 300)
    req = JobCreate(
        photo_asset_id="photo_123",
        voice_asset_id="voice_123",
        script=long_script,
        prompt="Random prompt",
        consent=consent,
        duration_preset="2m",
    )
    assert req.resolve_target_duration_seconds() == 120.0


def test_valid_explicit_seconds():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    long_script = " ".join(["word"] * 120)
    req = JobCreate(
        photo_asset_id="photo_123",
        voice_asset_id="voice_123",
        script=long_script,
        prompt="Random prompt",
        consent=consent,
        target_duration_seconds=45.0,
    )
    assert req.resolve_target_duration_seconds() == 45.0



def test_invalid_preset_rejected(monkeypatch):
    monkeypatch.setattr(settings, "allow_insecure_dev", True)
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    response = client.post(
        "/v1/jobs",
        json={
            "photo_asset_id": "photo_123",
            "voice_asset_id": "voice_123",
            "script": "Test script",
            "prompt": "Random prompt",
            "consent": {
                "authorized": True,
                "statement": "I authorize this video generation and own all rights.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
            },
            "duration_preset": "999h",
        },
    )
    assert response.status_code == 422


def test_too_long_duration_rejected(monkeypatch):
    monkeypatch.setattr(settings, "allow_insecure_dev", True)
    response = client.post(
        "/v1/jobs",
        json={
            "photo_asset_id": "photo_123",
            "voice_asset_id": "voice_123",
            "script": "Test script",
            "prompt": "Random prompt",
            "consent": {
                "authorized": True,
                "statement": "I authorize this video generation and own all rights.",
                "face_rights_attested": True,
                "voice_rights_attested": True,
            },
            "target_duration_seconds": 99999.0,
        },
    )
    assert response.status_code == 422



def test_explicit_field_overrides_prompt_text():
    # Prompt explicitly says "5 second video", but payload specifies target_duration_seconds=120.0
    plan = compile_plan(
        job_id="j_override",
        script="Hello world",
        prompt="Create a 5 second video.",
        explicit_duration_seconds=120.0,
    )
    assert plan.target_duration_seconds == 120.0
    assert plan.duration_source == "user_override"


def test_output_duration_deviates_more_than_10_percent_fails_qa(tmp_path):
    from src.services.qa import check_final
    # Video is 5s but target duration is 30s (deviates by 83.3% > 10%)
    res = check_final(video_path="non_existent.mp4", expected_duration=30.0, tolerance=3.0)
    assert res["passed"] is False or res.get("actual_duration") is None

    # Check check_final when actual duration is 5s and expected is 30s
    from unittest.mock import patch
    with patch("src.services.qa.probe_duration", return_value=5.0):
        res_fail = check_final(video_path="fake.mp4", expected_duration=30.0, tolerance=3.0)
        assert res_fail["passed"] is False
        assert res_fail["diff"] == 25.0

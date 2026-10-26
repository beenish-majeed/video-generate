import json
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.models.schemas import ConsentRequest, JobCreate
from src.services.jobs import create_job


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers = {"X-API-Key": settings.api_key or "test_key"}
    return c


def test_upload_path_missing_consent_rejected(client):
    payload = {
        "photo_asset_id": "photo_test_eval",
        "voice_asset_id": "voice_test_eval",
        "script": "Hello world, here is a long enough script to satisfy duration limits.",
        "target_duration_seconds": 5.0,
        # consent omitted
    }
    resp = client.post("/v1/jobs", json=payload)
    assert resp.status_code == 422
    assert any("consent" in str(err["loc"]) for err in resp.json()["detail"])


def test_upload_path_consent_unauthorized_rejected(client):
    payload = {
        "photo_asset_id": "photo_test_eval",
        "voice_asset_id": "voice_test_eval",
        "script": "Hello world, here is a long enough script to satisfy duration limits.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": False,
            "statement": "I own this face and voice and authorize generation.",
            "face_rights_attested": True,
            "voice_rights_attested": True,
        },
    }
    resp = client.post("/v1/jobs", json=payload)
    assert resp.status_code == 400
    assert "Authorization is required" in resp.json()["detail"]


def test_preset_path_missing_consent_rejected(client):
    payload = {
        "avatar_preset_id": "avatar_default",
        "voice_preset_id": "voice_piper_lessac",
        "script": "Hello world, here is a long enough script to satisfy duration limits.",
        "target_duration_seconds": 5.0,
        # consent omitted
    }
    resp = client.post("/v1/jobs", json=payload)
    assert resp.status_code == 422
    assert any("consent" in str(err["loc"]) for err in resp.json()["detail"])


def test_preset_path_consent_unauthorized_rejected(client):
    payload = {
        "avatar_preset_id": "avatar_default",
        "voice_preset_id": "voice_piper_lessac",
        "script": "Hello world, here is a long enough script to satisfy duration limits.",
        "target_duration_seconds": 5.0,
        "consent": {
            "authorized": False,
            "statement": "I accept this is AI-generated with an AI label.",
            "ai_generated_accepted": True,
        },
    }
    resp = client.post("/v1/jobs", json=payload)
    assert resp.status_code == 400
    assert "Authorization is required" in resp.json()["detail"]


def test_consent_record_stores_version_and_timestamp_without_pii():
    personal_statement = "I, Dr. Montgomery Scott, citizen of Scotland, authorize and accept this AI-generated video."
    consent = ConsentRequest(
        authorized=True,
        statement=personal_statement,
        consent_version="v1.0",
        ai_generated_accepted=True,
    )
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Hello world, here is a long enough script to satisfy duration limits.",
        target_duration_seconds=5.0,
        consent=consent,
    )
    job = create_job(req)
    assert job.consent is not None
    assert job.consent.authorized is True
    assert job.consent.consent_version == "v1.0"
    assert job.consent.timestamp is not None

    # Verify that serializing the job for manifest.json does NOT leak user's personal statement
    dump = job.model_dump_json(indent=2)
    parsed = json.loads(dump)

    assert "consent" in parsed
    assert parsed["consent"]["consent_version"] == "v1.0"
    assert "timestamp" in parsed["consent"]
    assert "Montgomery Scott" not in dump
    assert personal_statement not in dump
    assert "statement" not in parsed["consent"]

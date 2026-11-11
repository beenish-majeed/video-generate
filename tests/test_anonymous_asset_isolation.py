import io
import pytest
from PIL import Image
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.db.repository import AssetRepository

API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


@pytest.fixture
def sample_image_bytes():
    img = Image.new("RGB", (64, 64), color=(120, 180, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def consent_payload():
    return {
        "authorized": True,
        "statement": "I consent to the generation of this AI video and accept the AI label.",
        "ai_generated_accepted": True,
        "ai_label_accepted": True,
    }


def test_uploaded_asset_tagged_with_session_id(sample_image_bytes):
    client_a = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}

    resp = client_a.post(
        "/v1/assets/upload",
        headers=auth_headers,
        data={"kind": "photo"},
        files={"file": ("photo.jpg", io.BytesIO(sample_image_bytes), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    asset_id = data["asset_id"]

    # Verify asset is recorded in database with the caller's session_id
    asset_rec = AssetRepository.get(asset_id)
    assert asset_rec is not None
    assert getattr(asset_rec, "session_id", None) is not None
    assert asset_rec.session_id.startswith("sess_")


def test_visitor_cannot_use_another_visitors_asset(sample_image_bytes, consent_payload, monkeypatch):
    monkeypatch.setattr("src.api.routes.JOB_EXECUTOR.submit", MagicMock())

    client_a = TestClient(app)
    client_b = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}

    # Visitor A uploads a private photo
    resp_up = client_a.post(
        "/v1/assets/upload",
        headers=auth_headers,
        data={"kind": "photo"},
        files={"file": ("alice_private.jpg", io.BytesIO(sample_image_bytes), "image/jpeg")},
    )
    assert resp_up.status_code == 200
    asset_id_a = resp_up.json()["asset_id"]

    # Visitor B tries to create a job referencing Visitor A's asset
    job_payload_b = {
        "visual_mode": "picture_to_video",
        "photo_asset_id": asset_id_a,
        "consent": consent_payload,
    }
    resp_b = client_b.post("/v1/jobs", json=job_payload_b, headers=auth_headers)
    assert resp_b.status_code == 403
    assert "Access denied" in resp_b.json()["detail"]

    # Visitor A creates a job referencing their own asset -> 202 Accepted
    job_payload_a = {
        "visual_mode": "picture_to_video",
        "photo_asset_id": asset_id_a,
        "consent": consent_payload,
    }
    resp_a = client_a.post("/v1/jobs", json=job_payload_a, headers=auth_headers)
    assert resp_a.status_code == 202

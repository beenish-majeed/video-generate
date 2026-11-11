import pytest
from pathlib import Path
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.api import routes as api_routes
from src.services.jobs import save_job_record, load_job_record

client = TestClient(app)
API_KEY = "test-secret-key"


@pytest.fixture(autouse=True)
def configure_environment(monkeypatch):
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


@pytest.fixture
def consent_payload():
    return {
        "authorized": True,
        "statement": "I consent to the generation of this AI video and accept the AI label.",
        "ai_generated_accepted": True,
        "ai_label_accepted": True,
    }


def test_client_id_recorded_on_creation(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())
    headers = {"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"}

    payload = {
        "visual_mode": "text_to_video",
        "prompt": "Exploration of the deep oceanic trenches",
        "consent": consent_payload,
    }

    resp = client.post("/v1/jobs", json=payload, headers=headers)
    assert resp.status_code == 202, resp.text
    data = resp.json()
    job_id = data["job_id"]

    saved_job = load_job_record(job_id)
    assert saved_job is not None
    assert saved_job.client_id == "tenant_alpha"


def test_cross_user_idor_read_and_cancel_protection(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())

    # Create job owned by tenant_alpha
    resp = client.post(
        "/v1/jobs",
        json={
            "visual_mode": "text_to_video",
            "prompt": "Mars exploration base construction",
            "consent": consent_payload,
        },
        headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"},
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    # 1. Tenant Beta attempts to read Alpha's job -> 403 Forbidden
    resp_beta_read = client.get(
        f"/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_beta"},
    )
    assert resp_beta_read.status_code == 403
    assert "Access denied" in resp_beta_read.json()["detail"]

    # 2. Unassigned client attempts to read Alpha's job -> 403 Forbidden
    resp_anon_read = client.get(
        f"/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert resp_anon_read.status_code == 403

    # 3. Tenant Alpha reads their own job -> 200 OK
    resp_alpha_read = client.get(
        f"/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"},
    )
    assert resp_alpha_read.status_code == 200
    assert resp_alpha_read.json()["job_id"] == job_id

    # 4. Tenant Beta attempts to cancel Alpha's job -> 403 Forbidden
    resp_beta_cancel = client.post(
        f"/v1/jobs/{job_id}/cancel",
        headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_beta"},
    )
    assert resp_beta_cancel.status_code == 403

    # 5. Tenant Alpha cancels their own job -> 200 OK
    resp_alpha_cancel = client.post(
        f"/v1/jobs/{job_id}/cancel",
        headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"},
    )
    assert resp_alpha_cancel.status_code == 200
    assert resp_alpha_cancel.json()["state"] == JobState.CANCELLED.value


def test_cross_user_idor_download_and_delete_protection():
    job_id = "job_idor_test_01"
    out_dir = settings.storage_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    output_file = out_dir / f"{job_id}.mp4"
    output_file.write_bytes(b"dummy video content")

    dummy_req = JobCreate(
        visual_mode="text_to_video",
        prompt="Sample test prompt",
        consent=ConsentRequest(
            authorized=True,
            statement="I consent to the generation of this AI video and accept the AI label.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )

    job = JobRecord(
        job_id=job_id,
        client_id="tenant_alpha",
        state=JobState.COMPLETED,
        output_path=str(output_file),
        request=dummy_req,
    )
    save_job_record(job)

    try:
        # 1. Tenant Beta attempts to download -> 403 Forbidden
        resp_beta_dl = client.get(
            f"/v1/jobs/{job_id}/download",
            headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_beta"},
        )
        assert resp_beta_dl.status_code == 403

        # 2. Tenant Alpha downloads successfully -> 200 OK
        resp_alpha_dl = client.get(
            f"/v1/jobs/{job_id}/download",
            headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"},
        )
        assert resp_alpha_dl.status_code == 200
        assert resp_alpha_dl.content == b"dummy video content"

        # 3. Tenant Beta attempts to delete -> 403 Forbidden
        resp_beta_del = client.delete(
            f"/v1/jobs/{job_id}",
            headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_beta"},
        )
        assert resp_beta_del.status_code == 403
        assert load_job_record(job_id) is not None

        # 4. Tenant Alpha deletes successfully -> 200 OK
        resp_alpha_del = client.delete(
            f"/v1/jobs/{job_id}",
            headers={"X-API-Key": API_KEY, "X-Client-ID": "tenant_alpha"},
        )
        assert resp_alpha_del.status_code == 200
    finally:
        if output_file.exists():
            output_file.unlink()


def test_job_list_scoped_by_client_id():
    dummy_req = JobCreate(
        visual_mode="text_to_video",
        prompt="Sample test prompt",
        consent=ConsentRequest(
            authorized=True,
            statement="I consent to the generation of this AI video and accept the AI label.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        ),
    )

    job_a = JobRecord(job_id="job_list_alpha", client_id="client_a", request=dummy_req)
    job_b = JobRecord(job_id="job_list_beta", client_id="client_b", request=dummy_req)
    job_c = JobRecord(job_id="job_list_legacy", client_id=None, request=dummy_req)

    save_job_record(job_a)
    save_job_record(job_b)
    save_job_record(job_c)

    # Client A should see client_a and legacy, but NOT client_b
    resp_a = client.get("/v1/jobs", headers={"X-API-Key": API_KEY, "X-Client-ID": "client_a"})
    assert resp_a.status_code == 200
    ids_a = {j["job_id"] for j in resp_a.json()}
    assert "job_list_alpha" in ids_a
    assert "job_list_legacy" in ids_a
    assert "job_list_beta" not in ids_a

    # Client B should see client_b and legacy, but NOT client_a
    resp_b = client.get("/v1/jobs", headers={"X-API-Key": API_KEY, "X-Client-ID": "client_b"})
    assert resp_b.status_code == 200
    ids_b = {j["job_id"] for j in resp_b.json()}
    assert "job_list_beta" in ids_b
    assert "job_list_legacy" in ids_b
    assert "job_list_alpha" not in ids_b

    # Anonymous/Single-tenant should see all
    resp_all = client.get("/v1/jobs", headers={"X-API-Key": API_KEY})
    assert resp_all.status_code == 200
    ids_all = {j["job_id"] for j in resp_all.json()}
    assert "job_list_alpha" in ids_all
    assert "job_list_beta" in ids_all
    assert "job_list_legacy" in ids_all


def test_x_user_id_header_alias(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())
    # Creating job with X-User-ID instead of X-Client-ID
    resp = client.post(
        "/v1/jobs",
        json={
            "visual_mode": "text_to_video",
            "prompt": "Stellar astrophysics lecture",
            "consent": consent_payload,
        },
        headers={"X-API-Key": API_KEY, "X-User-ID": "user_42"},
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    # Accessing with X-User-ID matches
    resp_user = client.get(
        f"/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY, "X-User-ID": "user_42"},
    )
    assert resp_user.status_code == 200

    # Accessing with wrong X-User-ID is rejected
    resp_wrong = client.get(
        f"/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY, "X-User-ID": "user_99"},
    )
    assert resp_wrong.status_code == 403

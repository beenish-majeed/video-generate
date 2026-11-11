import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from src.main import app
from src.core.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.api import routes as api_routes
from src.services.jobs import save_job_record, load_job_record

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


def test_new_visitor_sees_fresh_workspace(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())

    # Visitor A creates a job
    client_a = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}
    resp_a = client_a.post(
        "/v1/jobs",
        json={
            "visual_mode": "text_to_video",
            "prompt": "Deep sea discovery documentary",
            "consent": consent_payload,
        },
        headers=auth_headers,
    )
    assert resp_a.status_code == 202
    job_id_a = resp_a.json()["job_id"]

    # Visitor A lists jobs and sees their own job
    list_a = client_a.get("/v1/jobs", headers=auth_headers)
    assert list_a.status_code == 200
    a_ids = [j["job_id"] for j in list_a.json()]
    assert job_id_a in a_ids

    # Visitor B (completely separate visitor/browser session) arrives
    client_b = TestClient(app)
    list_b = client_b.get("/v1/jobs", headers=auth_headers)
    assert list_b.status_code == 200
    b_ids = [j["job_id"] for j in list_b.json()]

    # Visitor B must see a fresh workspace, NEVER Visitor A's job
    assert job_id_a not in b_ids


def test_cross_visitor_access_blocked(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())

    client_a = TestClient(app)
    client_b = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}

    # Visitor A creates a job
    resp_a = client_a.post(
        "/v1/jobs",
        json={
            "visual_mode": "text_to_video",
            "prompt": "Ancient civilization architecture",
            "consent": consent_payload,
        },
        headers=auth_headers,
    )
    assert resp_a.status_code == 202
    job_id_a = resp_a.json()["job_id"]

    # 1. Visitor B attempts GET /v1/jobs/{job_id_a} -> Access Denied / Not Found
    resp_b_get = client_b.get(f"/v1/jobs/{job_id_a}", headers=auth_headers)
    assert resp_b_get.status_code in {403, 404}

    # 2. Visitor B attempts POST /v1/jobs/{job_id_a}/cancel -> Access Denied / Not Found
    resp_b_cancel = client_b.post(f"/v1/jobs/{job_id_a}/cancel", headers=auth_headers)
    assert resp_b_cancel.status_code in {403, 404}

    # 3. Visitor B attempts GET /v1/jobs/{job_id_a}/download -> Access Denied / Not Found
    resp_b_dl = client_b.get(f"/v1/jobs/{job_id_a}/download", headers=auth_headers)
    assert resp_b_dl.status_code in {403, 404}

    # 4. Visitor B attempts DELETE /v1/jobs/{job_id_a} -> Access Denied / Not Found
    resp_b_del = client_b.delete(f"/v1/jobs/{job_id_a}", headers=auth_headers)
    assert resp_b_del.status_code in {403, 404}

    # 5. Visitor A can read and cancel their own job
    resp_a_get = client_a.get(f"/v1/jobs/{job_id_a}", headers=auth_headers)
    assert resp_a_get.status_code == 200
    assert resp_a_get.json()["job_id"] == job_id_a


def test_header_spoofing_prevented(consent_payload, monkeypatch):
    monkeypatch.setattr(api_routes.JOB_EXECUTOR, "submit", MagicMock())

    client_a = TestClient(app)
    auth_headers = {"X-API-Key": API_KEY}

    resp_a = client_a.post(
        "/v1/jobs",
        json={
            "visual_mode": "text_to_video",
            "prompt": "Astrophysics exploration",
            "consent": consent_payload,
        },
        headers=auth_headers,
    )
    job_id_a = resp_a.json()["job_id"]
    job_a = load_job_record(job_id_a)
    session_id_a = getattr(job_a, "session_id", None) or getattr(job_a, "client_id", None)
    assert session_id_a is not None

    # Attacker tries to spoof session_id_a using X-Client-ID and X-User-ID headers
    client_attacker = TestClient(app)
    spoofed_headers = {
        "X-API-Key": API_KEY,
        "X-Client-ID": session_id_a,
        "X-User-ID": session_id_a,
    }

    # Attacker must NOT be granted access to Visitor A's job through header spoofing
    resp_spoof_read = client_attacker.get(f"/v1/jobs/{job_id_a}", headers=spoofed_headers)
    assert resp_spoof_read.status_code in {403, 404}

    resp_spoof_list = client_attacker.get("/v1/jobs", headers=spoofed_headers)
    assert resp_spoof_list.status_code == 200
    attacker_seen_ids = [j["job_id"] for j in resp_spoof_list.json()]
    assert job_id_a not in attacker_seen_ids

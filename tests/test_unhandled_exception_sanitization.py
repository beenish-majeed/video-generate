import sqlite3
from unittest.mock import patch
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app
from src.services.jobs import DB_PATH, _init_db, list_all_jobs, delete_job_record


client = TestClient(app, raise_server_exceptions=False)
AUTH_HEADERS = {"X-API-Key": settings.api_key}


def test_unhandled_exception_sanitized():
    # Patch an endpoint to simulate an unexpected internal runtime crash
    with patch("src.main.list_all_jobs", side_effect=RuntimeError("internal secret connection leak: password=topsecret /var/data")):
        resp = client.get("/v1/jobs", headers=AUTH_HEADERS)
        assert resp.status_code == 500
        data = resp.json()
        assert data == {"detail": "An internal server error occurred."}
        # Ensure no secret strings or file paths leaked
        assert "password" not in resp.text
        assert "topsecret" not in resp.text
        assert "/var/data" not in resp.text


def test_standard_http_exception_preserved():
    resp = client.get("/v1/jobs/job_nonexistent1234567890ab", headers=AUTH_HEADERS)
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Job not found."}


def test_sqlite_timeouts_standardized():
    # Verify that jobs.py specifies timeout=30.0 across all sqlite3.connect calls
    import inspect
    import src.services.jobs as jobs_mod

    source = inspect.getsource(jobs_mod)
    # Count occurrences of sqlite3.connect(
    connect_calls = [line.strip() for line in source.splitlines() if "sqlite3.connect(" in line]
    assert len(connect_calls) >= 5
    for call in connect_calls:
        assert "timeout=30.0" in call, f"Expected timeout=30.0 in call: {call}"

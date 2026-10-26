import logging
import sqlite3
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.jobs import DB_PATH, list_all_jobs


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers = {"X-API-Key": settings.api_key or "test_key"}
    return c


def test_validation_error_does_not_log_script_or_user_pii(client, caplog):
    secret_script = "CONFIDENTIAL_PATIENT_RECORD_XYZ_DO_NOT_LEAK"
    secret_pii = "BARTHOLOMEW_PII_CONSENT_AUTHORIZATION_PERSON"

    payload = {
        "avatar_preset_id": "avatar_default",
        "voice_preset_id": "voice_piper_lessac",
        "script": f"Short {secret_script}",
        "target_duration_seconds": 30.0,  # 30.0s triggers script length validation error
        "consent": {
            "authorized": True,
            "statement": f"I {secret_pii} authorize this video generation.",
            "ai_generated_accepted": True,
        },
    }

    with caplog.at_level(logging.WARNING):
        resp = client.post("/v1/jobs", json=payload)

    assert resp.status_code == 422

    # Assert that sensitive script and PII tokens were NEVER printed to the logs
    assert secret_script not in caplog.text, "Secret script text must not appear in server logs"
    assert secret_pii not in caplog.text, "Secret consent PII must not appear in server logs"

    # Assert that sanitized field names and error types are logged instead
    assert "body" in caplog.text or "Validation error" in caplog.text


def test_malformed_sqlite_job_validation_does_not_log_input_values(caplog):
    secret_db_content = "TOP_SECRET_MEDICAL_TRANSCRIPT_12345"
    malformed_job_json = (
        '{"job_id": "job_corrupt_test", "state": "INVALID_STATE", "request": {"script": "'
        + secret_db_content
        + '"}}'
    )

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO jobs (job_id, state, data, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            """,
            ("job_corrupt_test", "INVALID_STATE", malformed_job_json),
        )
        conn.commit()

    with caplog.at_level(logging.WARNING):
        _ = list_all_jobs()

    # Verify that raw input_value containing the secret script was redacted from warning logs
    assert secret_db_content not in caplog.text, "Corrupt job input_value must not be echoed in warning logs"
    assert "Skipping job record that failed validation" in caplog.text

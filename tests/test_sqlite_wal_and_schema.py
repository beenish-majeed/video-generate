import sqlite3
import pytest
from pathlib import Path

from src.services.jobs import _init_db, DB_PATH, save_job_record, load_job_record


def test_sqlite_schema_not_null_state(tmp_path, monkeypatch):
    test_db = tmp_path / "test_jobs_schema.db"
    monkeypatch.setattr("src.services.jobs.DB_PATH", test_db)
    monkeypatch.setattr("src.services.jobs.settings.storage_dir", tmp_path)

    _init_db()

    # Verify table schema has NOT NULL for state
    with sqlite3.connect(test_db) as conn:
        cursor = conn.execute("PRAGMA table_info(jobs)")
        columns = {row[1]: {"type": row[2], "notnull": row[3]} for row in cursor.fetchall()}

        assert "state" in columns
        assert columns["state"]["notnull"] == 1
        assert "NOT NULL" in sqlite3.connect(test_db).execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'"
        ).fetchone()[0].upper()

        # Attempting to insert NULL for state must raise IntegrityError
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO jobs (job_id, state, data, updated_at) VALUES (?, ?, ?, ?)",
                ("job_bad_null", None, "{}", "2026-10-29T00:00:00Z"),
            )


def test_sqlite_wal_mode_enabled(tmp_path, monkeypatch):
    test_db = tmp_path / "test_jobs_wal.db"
    monkeypatch.setattr("src.services.jobs.DB_PATH", test_db)
    monkeypatch.setattr("src.services.jobs.settings.storage_dir", tmp_path)

    _init_db()

    with sqlite3.connect(test_db) as conn:
        cursor = conn.execute("PRAGMA journal_mode")
        mode = cursor.fetchone()[0].lower()
        assert mode == "wal"

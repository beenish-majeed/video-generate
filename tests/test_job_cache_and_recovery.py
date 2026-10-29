import sqlite3
import pytest
from pathlib import Path
from src.models.schemas import JobRecord, JobState, JobCreate, ConsentRequest, utcnow
from src.services.job_cache import (
    BoundedJobCache,
    TERMINAL_JOB_STATES,
    RUNNING_JOB_STATES,
    NON_TERMINAL_STATES,
)
from src.services.job_recovery import recover_interrupted_jobs


def _make_dummy_job(job_id: str, state: JobState) -> JobRecord:
    req = JobCreate(
        photo_asset_id="dummy_photo",
        voice_asset_id="dummy_voice",
        script="Short dummy test script for validation.",
        prompt="Make a dummy video",
        consent=ConsentRequest(
            authorized=True,
            statement="I authorize this video generation and own all rights.",
            face_rights_attested=True,
            voice_rights_attested=True,
        ),
    )
    return JobRecord(
        job_id=job_id,
        state=state,
        request=req,
    )


def test_job_cache_lru_and_protection():
    cache = BoundedJobCache(maxsize=2)
    job1 = _make_dummy_job("job1", JobState.COMPLETED)
    job2 = _make_dummy_job("job2", JobState.GENERATING_SEGMENTS) # Running
    job3 = _make_dummy_job("job3", JobState.PLANNING_TIMELINE)   # Running

    cache["job1"] = job1
    cache["job2"] = job2
    # job1 is terminal, job2 is running. Adding job3 should evict job1 (terminal first)
    cache["job3"] = job3

    assert "job1" not in cache
    assert "job2" in cache
    assert "job3" in cache
    assert len(cache) == 2


def test_job_recovery_marks_interrupted_jobs(tmp_path: Path):
    db_path = tmp_path / "test_jobs.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE jobs (
                job_id TEXT PRIMARY KEY,
                state TEXT,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        job_stuck = _make_dummy_job("stuck_1", JobState.ASSEMBLING)
        job_done = _make_dummy_job("done_1", JobState.COMPLETED)
        conn.execute(
            "INSERT INTO jobs (job_id, state, data, updated_at) VALUES (?, ?, ?, ?)",
            (job_stuck.job_id, job_stuck.state.value, job_stuck.model_dump_json(), utcnow().isoformat()),
        )
        conn.execute(
            "INSERT INTO jobs (job_id, state, data, updated_at) VALUES (?, ?, ?, ?)",
            (job_done.job_id, job_done.state.value, job_done.model_dump_json(), utcnow().isoformat()),
        )
        conn.commit()

    cache = BoundedJobCache(maxsize=10)
    recovered = recover_interrupted_jobs(db_path=db_path, cache=cache)
    assert recovered == 1

    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT state, data FROM jobs WHERE job_id = ?", ("stuck_1",)).fetchone()
        assert row[0] == JobState.FAILED.value
        assert "interrupted by a server restart" in row[1]

        row_done = conn.execute("SELECT state FROM jobs WHERE job_id = ?", ("done_1",)).fetchone()
        assert row_done[0] == JobState.COMPLETED.value

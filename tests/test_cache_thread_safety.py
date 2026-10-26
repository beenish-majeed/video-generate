import concurrent.futures
import sqlite3
import pytest

from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import BoundedJobCache, DB_PATH, load_job_record, save_job_record


def make_dummy_job(job_id: str, state: JobState = JobState.COMPLETED) -> JobRecord:
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Hello world, this is a longer script to satisfy the minimum word count requirement.",
        target_duration_seconds=5.0,
        consent=ConsentRequest(
            authorized=True,
            statement="I authorize this video.",
            ai_generated_accepted=True,
        ),
    )
    return JobRecord(
        job_id=job_id,
        state=state,
        request=req,
    )


def test_bounded_job_cache_concurrent_thread_safety():
    cache = BoundedJobCache(maxsize=20)
    errors = []

    def worker(worker_id: int):
        try:
            for i in range(50):
                jid = f"job_thread_{worker_id}_{i}"
                state = JobState.COMPLETED if i % 2 == 0 else JobState.GENERATING_SEGMENTS
                job = make_dummy_job(jid, state=state)
                cache[jid] = job
                _ = cache.get(jid)
                _ = len(cache)
                _ = list(cache.values())
        except Exception as exc:
            errors.append(exc)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(worker, wid) for wid in range(8)]
        concurrent.futures.wait(futures)

    assert len(errors) == 0, f"Thread safety errors occurred: {errors}"
    assert len(cache) <= 20 or any(j.state not in {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED} for j in cache.values())


def test_never_evict_running_jobs_at_limit():
    cache = BoundedJobCache(maxsize=3)

    # Job 1 is running / non-terminal
    j1 = make_dummy_job("job_running_01", state=JobState.SYNTHESIZING_AUDIO)
    # Job 2 & 3 are completed
    j2 = make_dummy_job("job_completed_02", state=JobState.COMPLETED)
    j3 = make_dummy_job("job_completed_03", state=JobState.COMPLETED)

    cache["job_running_01"] = j1
    cache["job_completed_02"] = j2
    cache["job_completed_03"] = j3
    assert len(cache) == 3

    # Add Job 4 (terminal) -> maxsize 3 exceeded
    j4 = make_dummy_job("job_completed_04", state=JobState.COMPLETED)
    cache["job_completed_04"] = j4

    assert len(cache) == 3
    # Running job 1 MUST NOT be evicted
    assert "job_running_01" in cache
    # Oldest terminal job (job 2) was evicted
    assert "job_completed_02" not in cache
    assert "job_completed_03" in cache
    assert "job_completed_04" in cache


def test_all_active_jobs_preserved_when_capacity_exceeded():
    cache = BoundedJobCache(maxsize=2)

    # Add 4 active running jobs
    for i in range(1, 5):
        jid = f"job_active_{i}"
        cache[jid] = make_dummy_job(jid, state=JobState.GENERATING_SEGMENTS)

    # Because all jobs are active/running, none should be evicted prematurely
    assert len(cache) == 4
    for i in range(1, 5):
        assert f"job_active_{i}" in cache

    # Now complete job 1 and add job 5 -> job 1 can now be evicted
    cache["job_active_1"].state = JobState.COMPLETED
    cache["job_active_5"] = make_dummy_job("job_active_5", state=JobState.COMPLETED)

    # Job 1 was terminal so it gets evicted
    assert "job_active_1" not in cache
    assert "job_active_2" in cache
    assert "job_active_3" in cache


def test_state_change_written_to_sqlite():
    jid = "job_sqlite_sync_test"
    job = make_dummy_job(jid, state=JobState.RECEIVED)
    save_job_record(job)

    # Update state to SYNTHESIZING_AUDIO
    job.state = JobState.SYNTHESIZING_AUDIO
    save_job_record(job)

    # Directly inspect SQLite DB
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("SELECT state FROM jobs WHERE job_id = ?", (jid,))
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == JobState.SYNTHESIZING_AUDIO.value

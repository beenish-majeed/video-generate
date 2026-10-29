import pytest
from src.models.schemas import JobCreate, JobRecord, JobState, ConsentRequest
from src.services.jobs import cancel_job, delete_job_record, save_job_record, CANCELLED_JOB_IDS, JOBS


def test_cancelled_job_purged_from_memory_on_delete():
    job_id = "job_cancel_mem_test_123"
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        script="Test script for memory cleanup.",
        consent=ConsentRequest(authorized=True, ai_generated_accepted=True),
    )
    job = JobRecord(
        job_id=job_id,
        state=JobState.PLANNING_TIMELINE,
        request=req,
    )
    save_job_record(job)

    # Cancel job
    cancelled = cancel_job(job_id)
    assert cancelled.state == JobState.CANCELLED
    assert job_id in CANCELLED_JOB_IDS

    # Delete job record
    deleted = delete_job_record(job_id)
    assert deleted is True

    # Must be discarded from CANCELLED_JOB_IDS and JOBS cache to prevent memory accumulation
    assert job_id not in CANCELLED_JOB_IDS
    assert job_id not in JOBS

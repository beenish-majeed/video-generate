import threading
import time
import pytest
from unittest.mock import MagicMock, patch

from src.models.schemas import ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import create_job, run_job, is_job_executing, save_job_record, load_job_record


def test_concurrent_run_job_prevents_duplicate_execution(tmp_path):
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all explicit rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
    )
    req = JobCreate(
        visual_mode="text_to_video",
        prompt="Concurrency race condition test video",
        consent=consent,
    )
    job = create_job(req)
    job_id = job.job_id

    execution_count = 0
    gate = threading.Event()
    worker_started = threading.Event()

    def mock_voice_pack(*args, **kwargs):
        nonlocal execution_count
        execution_count += 1
        worker_started.set()
        gate.wait(timeout=5.0)
        from src.models.schemas import VoicePack
        return VoicePack(reference_audio_path="dummy.wav")

    def worker1():
        with patch("src.services.jobs.build_voice_pack", side_effect=mock_voice_pack):
            try:
                run_job(job_id)
            except Exception:
                pass

    t1 = threading.Thread(target=worker1)
    t1.start()

    # Wait until worker 1 is inside run_job
    assert worker_started.wait(timeout=3.0)
    assert is_job_executing(job_id)

    # Thread 2 tries to run the same job concurrently
    run_job(job_id)

    # Worker 2 must have skipped execution due to active worker lock
    assert execution_count == 1

    # Release worker 1 and finish
    gate.set()
    t1.join(timeout=3.0)
    assert not is_job_executing(job_id)


def test_run_job_skips_terminal_state_jobs():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all explicit rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
    )
    req = JobCreate(
        visual_mode="text_to_video",
        prompt="Terminal state check",
        consent=consent,
    )
    job = create_job(req)
    job.state = JobState.COMPLETED
    job.output_path = "/storage/dummy.mp4"
    save_job_record(job)

    with patch("src.clients.file_ai.FileAIClient.generate_text_to_video") as mock_gen:
        run_job(job.job_id)
        mock_gen.assert_not_called()

    # Reload and confirm state was untouched
    reloaded = load_job_record(job.job_id)
    assert reloaded.state == JobState.COMPLETED

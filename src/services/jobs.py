import json
import logging
import shutil
import sqlite3
from pathlib import Path
from uuid import uuid4
from typing import Dict, List, Optional

from src.config import settings
from src.models.schemas import JobCreate, JobRecord, JobState, utcnow
from src.services.animation_wav2lip import RealWav2LipProvider
from src.services.assembler import assemble
from src.services.consent import verify_consent
from src.services.identity_real import RealIdentityBuilder
from src.services.prompt_compiler import compile_plan
from src.services.qa import check_final, check_segment
from src.services.segment_scheduler import split_timeline
from src.services.store import get_asset_path, job_dir
from src.services.timeline_planner import build_timeline
from src.services.tts_piper import PiperTTSProvider
from src.services.voice import build_voice_pack

logger = logging.getLogger(__name__)
DB_PATH = settings.storage_dir / "jobs.db"


def _init_db() -> None:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                state TEXT NOTIGNOR,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


from collections import OrderedDict


class BoundedJobCache(OrderedDict):
    """
    LRU cache for recent JobRecords with max size to prevent memory leaks.
    """
    def __init__(self, maxsize: int = 100):
        super().__init__()
        self.maxsize = maxsize

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.move_to_end(key)
        if len(self) > self.maxsize:
            self.popitem(last=False)


_init_db()
JOBS: BoundedJobCache = BoundedJobCache(maxsize=100)


def save_job_record(job: JobRecord) -> None:
    job.updated_at = utcnow()
    JOBS[job.job_id] = job
    try:
        data_json = job.model_dump_json()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO jobs (job_id, state, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    state=excluded.state,
                    data=excluded.data,
                    updated_at=excluded.updated_at
                """,
                (job.job_id, job.state.value, data_json, job.updated_at.isoformat()),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"Error saving job to DB: {exc}")


def load_job_record(job_id: str) -> Optional[JobRecord]:
    if job_id in JOBS:
        return JOBS[job_id]

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute("SELECT data FROM jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            if row and row[0]:
                job = JobRecord.model_validate_json(row[0])
                JOBS[job_id] = job
                return job
    except Exception as exc:
        logger.error(f"Error loading job from DB: {exc}")

    return None


def list_all_jobs() -> List[JobRecord]:
    records: List[JobRecord] = []
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute("SELECT data FROM jobs ORDER BY updated_at DESC")
            for row in cursor.fetchall():
                if row and row[0]:
                    rec = JobRecord.model_validate_json(row[0])
                    records.append(rec)
                    JOBS[rec.job_id] = rec
    except Exception as exc:
        logger.error(f"Error listing jobs from DB: {exc}")

    return records or list(JOBS.values())


IN_PROGRESS_STATES = {
    JobState.PREPARING_IDENTITY,
    JobState.SYNTHESIZING_AUDIO,
    JobState.SCHEDULING_SEGMENTS,
    JobState.GENERATING_SEGMENTS,
    JobState.QA_CHECKING,
    JobState.ASSEMBLING,
    JobState.CONSENT_PENDING,
    JobState.COMPILING_PROMPT,
    JobState.PLANNING_TIMELINE,
    JobState.RECEIVED,
}


def recover_interrupted_jobs() -> int:
    interrupted_count = 0
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute(
                "SELECT data FROM jobs WHERE state NOT IN (?, ?)",
                (JobState.COMPLETED.value, JobState.FAILED.value),
            )
            rows = cursor.fetchall()
            for row in rows:
                if row and row[0]:
                    job = JobRecord.model_validate_json(row[0])
                    if job.state in IN_PROGRESS_STATES:
                        job.state = JobState.FAILED
                        job.error = "Job was interrupted by a server restart."
                        save_job_record(job)
                        interrupted_count += 1
    except Exception as exc:
        logger.error(f"Error during startup job recovery: {exc}")
    return interrupted_count


def _cleanup_intermediate_job_files(job_path: Path) -> None:
    if not job_path.exists():
        return

    keep_files = {"final_video.mp4", "subtitles.vtt", "manifest.json", "ai_label.png"}

    try:
        for item in job_path.iterdir():
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            elif item.is_file() and item.name not in keep_files:
                try:
                    item.unlink()
                except Exception:
                    pass
    except Exception as exc:
        logger.warning(f"Error during intermediate file cleanup for {job_path}: {exc}")



def create_job(request: JobCreate) -> JobRecord:
    job_id = f"job_{uuid4().hex[:12]}"

    photo_path = get_asset_path(request.photo_asset_id)
    voice_path = get_asset_path(request.voice_asset_id)

    if photo_path is None:
        raise ValueError("Photo asset not found.")

    if voice_path is None:
        raise ValueError("Voice asset not found.")

    consent = verify_consent(
        consent=request.consent,
        photo_path=photo_path,
        voice_path=voice_path,
        job_id=job_id,
    )

    explicit_dur = request.resolve_target_duration_seconds()

    plan = compile_plan(
        job_id=job_id,
        script=request.script,
        prompt=request.prompt,
        explicit_duration_seconds=explicit_dur,
        overrides=request.overrides,
        max_duration_policy_seconds=settings.max_duration_policy_seconds,
    )


    timeline = build_timeline(request.script, plan)

    job = JobRecord(
        job_id=job_id,
        state=JobState.CONSENT_VERIFIED,
        request=request,
        photo_path=str(photo_path),
        voice_path=str(voice_path),
        consent=consent,
        plan=plan,
        timeline=timeline,
    )

    save_job_record(job)
    return job


def get_job(job_id: str) -> JobRecord | None:
    return load_job_record(job_id)


def run_job(job_id: str) -> None:
    job = load_job_record(job_id)
    if job is None:
        return

    if job.plan is None or job.timeline is None:
        job.state = JobState.FAILED
        job.error = "Job plan or timeline is missing."
        save_job_record(job)
        return

    job_path = job_dir(job_id)

    try:
        # 1. Identity Pack
        job.state = JobState.PREPARING_IDENTITY
        save_job_record(job)

        id_builder = RealIdentityBuilder()
        job.identity_pack = id_builder.build_identity_pack(Path(job.photo_path), job_path)

        # 2. Voice Pack
        voice_pack = build_voice_pack(Path(job.voice_path), job_path)
        job.voice_pack = voice_pack

        # 3. TTS Synthesis
        job.state = JobState.SYNTHESIZING_AUDIO
        save_job_record(job)

        if settings.tts_provider.lower() == "cosyvoice":
            from src.services.tts_cosyvoice import CosyVoiceTTSProvider
            tts_provider = CosyVoiceTTSProvider()
        else:
            tts_provider = PiperTTSProvider()

        tts_map = {}
        for event in job.timeline.events:
            tts_map[event.event_id] = tts_provider.synthesize_event(
                event=event,
                plan=job.plan,
                job_path=job_path,
                voice_sample_path=job.voice_path,
            )

        # 4. Segment Scheduling
        job.state = JobState.SCHEDULING_SEGMENTS
        save_job_record(job)

        segments = split_timeline(
            timeline=job.timeline,
            max_segment_seconds=settings.max_segment_seconds,
        )

        # 5. Animation Generation
        job.state = JobState.GENERATING_SEGMENTS
        save_job_record(job)

        anim_provider = RealWav2LipProvider()

        for segment in segments:
            logger.info(f"Generating segment {segment.segment_id} ({segment.duration_s}s)...")
            video_path = anim_provider.generate_segment(
                segment=segment,
                plan=job.plan,
                job_path=job_path,
                identity_pack=job.identity_pack,
                voice_pack=job.voice_pack,
            )
            segment.video_path = str(video_path)

            qa_result = check_segment(
                video_path=segment.video_path,
                expected_duration=segment.duration_s,
            )
            if not qa_result.get("passed"):
                raise RuntimeError(f"Segment QA failed for {segment.segment_id}: {qa_result}")

        job.segments = segments

        # 6. Assembly
        job.state = JobState.ASSEMBLING
        save_job_record(job)

        output_path, subtitle_path = assemble(
            job_path=job_path,
            plan=job.plan,
            timeline=job.timeline,
            segments=segments,
            tts_segments_by_event_id=tts_map,
        )

        final_qa = check_final(
            video_path=output_path,
            expected_duration=job.plan.target_duration_seconds,
        )
        if not final_qa.get("passed"):
            raise RuntimeError(f"Final QA failed: {final_qa}")

        job.output_path = str(output_path)
        job.subtitle_path = str(subtitle_path) if subtitle_path else None
        job.state = JobState.COMPLETED

    except Exception as exc:
        logger.exception(f"Job execution failed for {job_id}: {exc}")
        job.state = JobState.FAILED
        job.error = f"{type(exc).__name__}: {exc}"

    finally:
        save_job_record(job)
        try:
            manifest_path = job_path / "manifest.json"
            manifest_path.write_text(
                job.model_dump_json(indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass
        _cleanup_intermediate_job_files(job_path)
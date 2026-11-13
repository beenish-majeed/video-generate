import json
import logging
import os
import shutil
import sqlite3
import stat
import threading
from pathlib import Path
from uuid import uuid4
from typing import Dict, List, Optional

from src.config import settings
from src.db.repository import JobRepository
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
from src.services.tts import CosyVoiceTTSProvider, PiperTTSProvider
from src.services.voice import build_voice_pack
from src.utils.ffmpeg import probe_duration, adapt_audio_tempo


logger = logging.getLogger(__name__)


def _get_db_path() -> Path:
    import sys
    this_mod = sys.modules.get("src.services.jobs")
    mod_db_path = getattr(this_mod, "DB_PATH", None) if this_mod else None
    default_db_path = getattr(settings, "db_path", settings.storage_dir / "jobs.db")
    if mod_db_path is not None and Path(mod_db_path).name != default_db_path.name:
        target = Path(mod_db_path)
    else:
        target = default_db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


DB_PATH = settings.storage_dir / "jobs.db"


def _init_db(target_db: Optional[Path] = None) -> None:
    db_file = target_db or _get_db_path()
    db_file.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_file, timeout=30.0) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                data TEXT,
                data_json TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        # Migrate existing table if columns are missing
        columns = {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "data_json" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN data_json TEXT")
        if "data" not in columns:
            conn.execute("ALTER TABLE jobs ADD COLUMN data TEXT")
        conn.commit()


from src.services.job_cache import (
    BoundedJobCache,
    TERMINAL_JOB_STATES,
    RUNNING_JOB_STATES,
    NON_TERMINAL_STATES,
)
from src.services.job_recovery import recover_interrupted_jobs


_init_db()
try:
    recover_interrupted_jobs()
except Exception:
    pass
JOBS: BoundedJobCache = BoundedJobCache(maxsize=100)


def _get_job_table_columns(conn: sqlite3.Connection) -> set[str]:
    try:
        return {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
    except Exception:
        return {"data"}


def save_job_record(job: JobRecord, update_timestamp: bool = True) -> None:
    if update_timestamp or not job.updated_at:
        job.updated_at = utcnow()
    JOBS[job.job_id] = job
    try:
        data_json = job.model_dump_json()
        db_path = _get_db_path()
        if not db_path.exists():
            _init_db(db_path)
        with sqlite3.connect(db_path, timeout=30.0) as conn:
            cols = _get_job_table_columns(conn)
            if "data_json" in cols and "data" in cols:
                conn.execute(
                    """
                    INSERT INTO jobs (job_id, state, data, data_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(job_id) DO UPDATE SET
                        state=excluded.state,
                        data=excluded.data,
                        data_json=excluded.data_json,
                        updated_at=excluded.updated_at
                    """,
                    (job.job_id, job.state.value, data_json, data_json, job.updated_at.isoformat()),
                )
            elif "data_json" in cols:
                conn.execute(
                    """
                    INSERT INTO jobs (job_id, state, data_json, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(job_id) DO UPDATE SET
                        state=excluded.state,
                        data_json=excluded.data_json,
                        updated_at=excluded.updated_at
                    """,
                    (job.job_id, job.state.value, data_json, job.updated_at.isoformat()),
                )
            else:
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
        with sqlite3.connect(_get_db_path(), timeout=30.0) as conn:
            cols = _get_job_table_columns(conn)
            col_expr = "coalesce(data_json, data)" if ("data_json" in cols and "data" in cols) else ("data_json" if "data_json" in cols else "data")
            cursor = conn.execute(f"SELECT {col_expr} FROM jobs WHERE job_id = ?", (job_id,))
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
        with sqlite3.connect(_get_db_path(), timeout=30.0) as conn:
            cols = _get_job_table_columns(conn)
            col_expr = "coalesce(data_json, data)" if ("data_json" in cols and "data" in cols) else ("data_json" if "data_json" in cols else "data")
            cursor = conn.execute(f"SELECT {col_expr} FROM jobs ORDER BY updated_at DESC")
            for row in cursor.fetchall():
                if row and row[0]:
                    try:
                        rec = JobRecord.model_validate_json(row[0])
                        records.append(rec)
                        JOBS[rec.job_id] = rec
                    except Exception as row_exc:
                        if hasattr(row_exc, "errors"):
                            fields_summary = ", ".join(
                                f"{'.'.join(str(p) for p in err.get('loc', []))}: {err.get('type')}"
                                for err in row_exc.errors()
                            )
                            logger.warning(
                                f"Skipping job record that failed validation: {type(row_exc).__name__} ({fields_summary})"
                            )
                        else:
                            logger.warning(
                                f"Skipping job record that failed validation: {type(row_exc).__name__}"
                            )
    except Exception as exc:
        logger.error(f"Error listing jobs from DB: {exc}")

    return records or list(JOBS.values())


def count_active_jobs() -> int:
    """Count number of jobs currently active (queued or running in flight)."""
    try:
        return JobRepository.count_active_jobs()
    except Exception:
        return sum(1 for j in JOBS.values() if j.state in NON_TERMINAL_STATES)



from datetime import datetime, timezone


def _cleanup_intermediate_job_files(
    job_path: Path,
    is_failed: bool = False,
    is_cancelled: bool = False,
    updated_at: Optional[datetime] = None,
) -> None:
    if not job_path.exists():
        return

    # Cancelled jobs: delete intermediate segments and stems right away
    if is_cancelled:
        keep_files = {"manifest.json", "ai_label.png"}
        try:
            for item in job_path.iterdir():
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                elif item.is_file() and item.name not in keep_files:
                    try:
                        item.unlink()
                    except Exception as unlink_exc:
                        logger.debug(f"Could not unlink intermediate file {item}: {unlink_exc}")
        except Exception as exc:
            logger.warning(f"Error during cancelled job cleanup for {job_path}: {exc}")
        return

    # Failed jobs: retain files for debugging only during the configured retention period
    if is_failed:
        if updated_at is not None:
            age_seconds = (utcnow() - updated_at).total_seconds()
            retention_seconds = settings.failed_job_retention_hours * 3600.0
            if age_seconds < retention_seconds:
                # Keep intermediate files for debugging failed job within retention period
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


CANCELLED_JOB_IDS: set[str] = set()


def is_job_cancelled(job_id: str) -> bool:
    if job_id in CANCELLED_JOB_IDS:
        return True
    job = load_job_record(job_id)
    return job is not None and job.state == JobState.CANCELLED


def cancel_job(job_id: str) -> Optional[JobRecord]:
    job = load_job_record(job_id)
    if job is None:
        return None

    if job.state in {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}:
        return job

    CANCELLED_JOB_IDS.add(job_id)
    job.state = JobState.CANCELLED
    job.error = "Job was cancelled by the user."
    save_job_record(job)

    job_path = job_dir(job_id)
    _cleanup_intermediate_job_files(job_path, is_cancelled=True)
    return job


def safe_rmtree(path: Path) -> None:
    """Safely remove a directory tree, clearing Windows read-only attributes on error."""
    if not path.exists():
        return

    def _handle_readonly(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE | stat.S_IREAD)
            func(p)
        except Exception:
            pass

    try:
        shutil.rmtree(path, onexc=_handle_readonly)
    except Exception:
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass


def delete_job_record(job_id: str) -> bool:
    job = load_job_record(job_id)
    if job is None:
        return False

    if job.state in NON_TERMINAL_STATES:
        raise ValueError(f"Cannot delete active job '{job_id}' (state: {job.state}). Cancel the job first.")

    # Remove job folder
    path = job_dir(job_id)
    safe_rmtree(path)

    # Remove from in-memory cache and cancellation tracking
    JOBS.pop(job_id, None)
    CANCELLED_JOB_IDS.discard(job_id)

    # Remove from SQLite
    try:
        with sqlite3.connect(_get_db_path(), timeout=30.0) as conn:
            conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
            conn.commit()
    except Exception as exc:
        logger.error(f"Error deleting job '{job_id}' from DB: {exc}")

    return True


def create_job(request: JobCreate) -> JobRecord:
    job_id = f"job_{uuid4().hex}"

    is_clips_mode = bool(request.visual_mode == "ai_clips")
    is_my_own = bool(request.uploaded_image_asset_ids)
    is_preset_path = bool((request.avatar_preset_id or request.visual_mode in ("slideshow", "ai_clips")) and request.voice_preset_id)

    clip_paths = []
    if is_clips_mode:
        for cid in request.clip_asset_ids:
            p = get_asset_path(cid)
            if p is None or not p.exists():
                raise ValueError(f"Uploaded clip asset '{cid}' not found.")
            clip_paths.append(p)
        photo_path = clip_paths[0] if clip_paths else None

        if request.uploaded_audio_asset_id or request.voice_asset_id:
            voice_path = get_asset_path(request.uploaded_audio_asset_id or request.voice_asset_id)
            if voice_path is None or not voice_path.exists():
                raise ValueError("Uploaded audio asset not found.")
            explicit_dur = probe_duration(voice_path)
        else:
            from src.services.presets import get_allowed_voice_preset_ids, get_voice_sample_path
            if request.voice_preset_id:
                voice_path = get_voice_sample_path(request.voice_preset_id)
            else:
                voice_ids = get_allowed_voice_preset_ids()
                voice_path = get_voice_sample_path(voice_ids[0]) if voice_ids else None
            if voice_path is None or not voice_path.exists():
                raise ValueError("Default voice sample for Piper synthesis not found.")
            explicit_dur = request.resolve_target_duration_seconds()
            if explicit_dur is None:
                words = len(request.script.split()) if request.script else 0
                explicit_dur = (words / settings.words_per_minute) * 60.0 if words > 0 else 5.0

    elif request.visual_mode == "text_to_video":
        photo_path = None
        from src.services.presets import get_allowed_voice_preset_ids, get_voice_sample_path
        if request.voice_preset_id:
            voice_path = get_voice_sample_path(request.voice_preset_id)
        else:
            voice_ids = get_allowed_voice_preset_ids()
            voice_path = get_voice_sample_path(voice_ids[0]) if voice_ids else None
        explicit_dur = request.resolve_target_duration_seconds() or 10.0

    elif request.visual_mode == "picture_to_video":
        photo_path = None
        if request.photo_asset_id:
            photo_path = get_asset_path(request.photo_asset_id)
        elif request.avatar_preset_id:
            from src.services.presets import get_avatar_file_path
            photo_path = get_avatar_file_path(request.avatar_preset_id)
        elif request.uploaded_image_asset_ids:
            photo_path = get_asset_path(request.uploaded_image_asset_ids[0])

        if photo_path is None or not photo_path.exists():
            raise ValueError("Input image asset not found for picture_to_video.")

        audio_mode = getattr(request, "audio_mode", "ai_generated")
        if audio_mode == "original_audio" and (request.uploaded_audio_asset_id or request.voice_asset_id):
            voice_path = get_asset_path(request.uploaded_audio_asset_id or request.voice_asset_id)
            if voice_path is None or not voice_path.exists():
                raise ValueError("Uploaded original audio asset not found.")
            explicit_dur = probe_duration(voice_path)
        else:
            from src.services.presets import get_allowed_voice_preset_ids, get_voice_sample_path
            if request.voice_preset_id:
                voice_path = get_voice_sample_path(request.voice_preset_id)
            else:
                voice_ids = get_allowed_voice_preset_ids()
                voice_path = get_voice_sample_path(voice_ids[0]) if voice_ids else None
            explicit_dur = request.resolve_target_duration_seconds() or 5.0

    elif is_my_own:
        image_paths = []
        for img_id in request.uploaded_image_asset_ids:
            p = get_asset_path(img_id)
            if p is None or not p.exists():
                raise ValueError(f"Uploaded image asset '{img_id}' not found.")
            image_paths.append(p)
        photo_path = image_paths[0]

        if request.uploaded_audio_asset_id:
            voice_path = get_asset_path(request.uploaded_audio_asset_id)
            if voice_path is None or not voice_path.exists():
                raise ValueError(f"Uploaded audio asset '{request.uploaded_audio_asset_id}' not found.")
            audio_dur = probe_duration(voice_path)
            explicit_dur = audio_dur
            if request.image_durations:
                diff = abs(sum(request.image_durations) - audio_dur)
                if diff > 0.5:
                    raise ValueError(
                        f"Image durations sum ({sum(request.image_durations):.2f}s) must match audio length ({audio_dur:.2f}s)."
                    )
                elif diff > 0.001:
                    request.image_durations[-1] += (audio_dur - sum(request.image_durations))
            else:
                n_imgs = len(image_paths)
                request.image_durations = [audio_dur / n_imgs] * n_imgs
        else:
            from src.services.presets import get_allowed_voice_preset_ids, get_voice_sample_path
            if request.voice_preset_id:
                voice_path = get_voice_sample_path(request.voice_preset_id)
            else:
                voice_ids = get_allowed_voice_preset_ids()
                voice_path = get_voice_sample_path(voice_ids[0]) if voice_ids else None
            if voice_path is None or not voice_path.exists():
                raise ValueError("Default voice sample for Piper synthesis not found.")
            explicit_dur = request.resolve_target_duration_seconds()
            if explicit_dur is None:
                words = len(request.script.split()) if request.script else 0
                explicit_dur = (words / settings.words_per_minute) * 60.0 if words > 0 else 5.0
            if request.image_durations:
                if abs(sum(request.image_durations) - explicit_dur) > 0.5:
                    raise ValueError(
                        f"Image durations sum ({sum(request.image_durations):.2f}s) must match target duration ({explicit_dur:.2f}s)."
                    )

    elif is_preset_path:
        from src.services.presets import get_avatar_file_path, get_voice_sample_path
        photo_path = get_avatar_file_path(request.avatar_preset_id or "avatar_default")
        voice_path = get_voice_sample_path(request.voice_preset_id)
        if photo_path is None:
            raise ValueError(f"Avatar preset '{request.avatar_preset_id or 'avatar_default'}' file not found.")
        if voice_path is None:
            raise ValueError(f"Voice preset '{request.voice_preset_id}' file not found.")
        explicit_dur = request.resolve_target_duration_seconds()
    else:
        photo_path = get_asset_path(request.photo_asset_id)
        voice_path = get_asset_path(request.voice_asset_id)

        if photo_path is None:
            raise ValueError("Photo asset not found.")

        if voice_path is None:
            raise ValueError("Voice asset not found.")
        explicit_dur = request.resolve_target_duration_seconds()

    consent = verify_consent(
        consent=request.consent,
        photo_path=photo_path,
        voice_path=voice_path,
        job_id=job_id,
        is_preset_path=is_preset_path or (request.visual_mode == "text_to_video"),
        clip_paths=clip_paths if is_clips_mode else None,
    )

    overrides = dict(request.overrides or {})
    if request.burn_subtitles is not None:
        overrides["subtitles.burn_in"] = request.burn_subtitles
    if request.subtitles_enabled is not None:
        overrides["subtitles.enabled"] = request.subtitles_enabled

    script_text = request.script or ""
    plan = compile_plan(
        job_id=job_id,
        script=script_text,
        prompt=request.prompt,
        explicit_duration_seconds=explicit_dur,
        overrides=overrides,
        max_duration_policy_seconds=settings.max_duration_policy_seconds,
        music_asset_id=request.music_asset_id,
        music_preset_id=request.music_preset_id,
        music_volume=request.music_volume,
        music_ducking=request.music_ducking,
    )

    timeline = build_timeline(script_text, plan)

    job = JobRecord(
        job_id=job_id,
        state=JobState.CONSENT_VERIFIED,
        request=request,
        photo_path=str(photo_path) if photo_path else None,
        voice_path=str(voice_path) if voice_path else None,
        consent=consent,
        plan=plan,
        timeline=timeline,
        clip_asset_ids=request.clip_asset_ids,
        plan_id=request.plan_id,
        music_asset_id=request.music_asset_id,
        music_preset_id=request.music_preset_id,
        music_volume=request.music_volume,
        music_ducking=request.music_ducking,
        music_applied=None,
    )

    from datetime import timedelta
    dur = float(plan.target_duration_seconds)
    v_mode = getattr(request, "visual_mode", "talking_head")
    if v_mode in ("picture_to_video", "talking_head"):
        render_mult = 2.7
    elif v_mode == "ai_clips":
        render_mult = 0.5
    else:
        render_mult = 0.85
    job.estimated_render_seconds = round(dur * render_mult, 1)
    job.retention_expires_at = job.created_at + timedelta(hours=settings.job_retention_hours)

    save_job_record(job)
    return job


def get_job(job_id: str) -> JobRecord | None:
    return load_job_record(job_id)


_EXECUTING_JOB_IDS: set[str] = set()
_EXECUTING_JOBS_LOCK = threading.Lock()


def is_job_executing(job_id: str) -> bool:
    with _EXECUTING_JOBS_LOCK:
        return job_id in _EXECUTING_JOB_IDS


def run_job(job_id: str) -> None:
    with _EXECUTING_JOBS_LOCK:
        if job_id in _EXECUTING_JOB_IDS:
            logger.warning(f"Job {job_id} is already currently executing on an active worker; skipping duplicate execution.")
            return
        _EXECUTING_JOB_IDS.add(job_id)

    job = None
    job_path = None
    should_save_and_cleanup = False
    try:
        job = load_job_record(job_id)
        if job is None:
            return

        if job.state in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED):
            logger.warning(f"Job {job_id} is already in terminal state {job.state.value}; skipping re-execution.")
            return

        if job.plan is None or job.timeline is None:
            job.state = JobState.FAILED
            job.error = "Job plan or timeline is missing."
            save_job_record(job)
            return

        job_path = job_dir(job_id)
        should_save_and_cleanup = True

        if is_job_cancelled(job_id):
            return

        is_my_own = bool(getattr(job.request, "uploaded_image_asset_ids", None))
        visual_mode = getattr(job.request, "visual_mode", "talking_head")

        # Early pre-flight validation of music asset/preset before rendering segments
        music_id = job.request.music_preset_id or job.request.music_asset_id
        if music_id:
            try:
                from src.services.music_presets import resolve_job_music_path
                music_file = resolve_job_music_path(
                    job.request.music_asset_id,
                    job.request.music_preset_id,
                )
                if music_file is None or not music_file.exists():
                    raise FileNotFoundError(f"Music file '{music_id}' not found.")

                from src.utils.subprocess_runner import run_subprocess

                probe_cmd = [
                    settings.ffprobe_bin,
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file",
                    "-select_streams",
                    "a:0",
                    "-show_entries",
                    "stream=codec_type:format=duration",
                    "-of",
                    "json",
                    str(music_file),
                ]
                probe_res = run_subprocess(probe_cmd, timeout=settings.subprocess_ffprobe_timeout_seconds)
                if probe_res.returncode != 0:
                    raise ValueError(f"ffprobe failed: {probe_res.stderr.strip()[:100]}")
                data = json.loads(probe_res.stdout)
                streams = data.get("streams", [])
                if not streams or streams[0].get("codec_type") != "audio":
                    raise ValueError("No valid audio stream found in music asset")
                dur = float(data.get("format", {}).get("duration", 0.0))
                if dur <= 0:
                    raise ValueError("Music duration is 0 or invalid")

                dec_cmd = [
                    settings.ffmpeg_bin,
                    "-v",
                    "error",
                    "-nostdin",
                    "-protocol_whitelist",
                    "file",
                    "-i",
                    str(music_file),
                    "-f",
                    "null",
                    "-",
                ]
                dec_proc = run_subprocess(dec_cmd, timeout=settings.subprocess_default_timeout_seconds)
                if dec_proc.returncode != 0:
                    raise ValueError(f"ffmpeg decode failed: {dec_proc.stderr.strip()[:100]}")
            except Exception as exc:
                job.music_applied = False
                job.music_error = f"Music asset '{music_id}' failed preflight: {exc}"
                job.music_failure_reason = job.music_error
                if job.plan:
                    job.plan.music_applied = False
                    job.plan.music_error = job.music_error
                logger.warning(
                    f"Job {job_id}: {job.music_error}; falling back to render without music."
                )
        if is_my_own:
            image_paths = [get_asset_path(img_id) for img_id in job.request.uploaded_image_asset_ids]

            # 1. Resolve speech audio
            if job.request.uploaded_audio_asset_id:
                speech_audio_path = Path(job.voice_path)
            else:
                job.state = JobState.SYNTHESIZING_AUDIO
                save_job_record(job)
                tts_provider = PiperTTSProvider()
                from src.models.schemas import TimelineEvent
                ev = TimelineEvent(
                    event_id="piper_speech",
                    type="speech",
                    start_s=0.0,
                    end_s=float(job.plan.target_duration_seconds),
                    text=job.plan.script,
                )
                tts_res = tts_provider.synthesize_event(
                    event=ev,
                    plan=job.plan,
                    job_path=job_path,
                    voice_sample_path=job.voice_path,
                )
                speech_audio_path = Path(tts_res.audio_path)

            audio_dur = probe_duration(speech_audio_path)

            # 2. Evaluate visual mode (lip sync vs Ken Burns)
            prefer_lip_sync = getattr(job.request, "prefer_lip_sync", False)
            if prefer_lip_sync and image_paths and image_paths[0]:
                mode_used = "talking_head"
                mode_reason = "User requested lip-sync animation for portrait."
                face_image_path = image_paths[0]
            else:
                mode_used = "slideshow"
                mode_reason = "Slideshow mode selected."
                face_image_path = None

            job.visual_mode_used = mode_used
            job.visual_mode_reason = mode_reason
            save_job_record(job)

            # 3. Subtitles (auto-subtitles or plan subtitles)
            subtitle_path = None
            if getattr(job.request, "auto_subtitles", False) or job.plan.subtitles.enabled:
                from src.services.subtitles import generate_webvtt
                from src.models.schemas import Timeline, TimelineEvent, TTSSegment
                sub_p = job_path / "subtitles.vtt"
                ev = TimelineEvent(
                    event_id="speech_0000",
                    type="speech",
                    start_s=0.0,
                    end_s=round(audio_dur, 2),
                    text=job.plan.script or "Uploaded audio",
                )
                sub_tl = Timeline(events=[ev], total_duration_seconds=round(audio_dur, 2))
                tts_map = {"speech_0000": TTSSegment(event_id="speech_0000", audio_path=str(speech_audio_path), duration_seconds=round(audio_dur, 2))}
                generate_webvtt(sub_tl, tts_map, sub_p)
                subtitle_path = sub_p

            label_path = job_path / "ai_label.png"
            from src.utils.images import create_ai_label_png
            label_text = (job.plan.safety.label_text if job.plan and job.plan.safety and job.plan.safety.label_text else "AI-generated")
            create_ai_label_png(label_path, label_text)

            if mode_used == "talking_head" and face_image_path is not None:
                # Talking head lip-sync branch (Wav2Lip)
                job.state = JobState.PREPARING_IDENTITY
                save_job_record(job)
                id_builder = RealIdentityBuilder()
                job.identity_pack = id_builder.build_identity_pack(face_image_path, job_path)

                voice_pack = build_voice_pack(speech_audio_path, job_path)
                job.voice_pack = voice_pack

                job.state = JobState.GENERATING_SEGMENTS
                save_job_record(job)

                audio_dir = job_path / "audio"
                audio_dir.mkdir(parents=True, exist_ok=True)
                seg_audio_dest = audio_dir / "my_own_speech.wav"
                shutil.copyfile(speech_audio_path, seg_audio_dest)

                from src.models.schemas import SegmentSpec, TimelineEvent
                seg_ev = TimelineEvent(
                    event_id="my_own_speech",
                    type="speech",
                    start_s=0.0,
                    end_s=round(audio_dur, 2),
                    text=job.plan.script or "Uploaded audio",
                )
                segment = SegmentSpec(
                    segment_id="segment_0000",
                    start_s=0.0,
                    duration_s=audio_dur,
                    events=[seg_ev],
                )

                anim_provider = RealWav2LipProvider()
                video_path = anim_provider.generate_segment(
                    segment=segment,
                    plan=job.plan,
                    job_path=job_path,
                    identity_pack=job.identity_pack,
                    voice_pack=job.voice_pack,
                )
                segment.video_path = str(video_path)
                job.segments = [segment]

                job.state = JobState.ASSEMBLING
                save_job_record(job)

                output_path = job_path / "final_video.mp4"
                from src.utils.ffmpeg import finalize_video, mix_background_music

                final_speech_audio = speech_audio_path
                music_id = job.request.music_preset_id or job.request.music_asset_id
                if music_id and job.music_applied is not False:
                    try:
                        from src.services.music_presets import resolve_job_music_path
                        m_path = resolve_job_music_path(job.request.music_asset_id, job.request.music_preset_id)
                        if m_path and m_path.exists():
                            mixed_audio = job_path / "final_audio_with_music.wav"
                            mix_background_music(
                                speech_path=speech_audio_path,
                                music_path=m_path,
                                output_path=mixed_audio,
                                target_duration=audio_dur,
                                volume=job.request.music_volume,
                                ducking=job.request.music_ducking,
                            )
                            final_speech_audio = mixed_audio
                            job.music_applied = True
                        else:
                            job.music_applied = False
                            job.music_error = f"Music file '{music_id}' not found during assembly"
                            job.music_failure_reason = job.music_error
                    except Exception as exc:
                        logger.warning(f"Background music mixing failed: {exc}; falling back to speech only.")
                        job.music_applied = False
                        job.music_error = str(exc)
                        job.music_failure_reason = str(exc)
                        final_speech_audio = speech_audio_path

                finalize_video(
                    video_path=video_path,
                    audio_path=final_speech_audio,
                    watermark_path=label_path,
                    output_path=output_path,
                    duration=audio_dur,
                    subtitle_path=subtitle_path,
                    burn_subtitles=job.plan.subtitles.burn_in,
                )

            else:
                # Slideshow Ken Burns branch
                job.state = JobState.GENERATING_SEGMENTS
                save_job_record(job)

                if job.request.image_durations:
                    durations = [float(d) for d in job.request.image_durations]
                else:
                    n_imgs = len(image_paths)
                    durations = [audio_dur / n_imgs] * n_imgs

                job.state = JobState.ASSEMBLING
                save_job_record(job)

                bg_music_path = None
                if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                    from src.services.music_presets import resolve_job_music_path
                    bg_music_path = resolve_job_music_path(job.request.music_asset_id, job.request.music_preset_id)

                from src.services.slideshow_compositor import SlideshowCompositor
                output_path = SlideshowCompositor.compose_user_slideshow(
                    job_path=job_path,
                    image_paths=image_paths,
                    image_durations=durations,
                    audio_path=speech_audio_path,
                    bg_music_path=bg_music_path,
                    bg_music_volume=job.request.music_volume,
                    bg_music_ducking=job.request.music_ducking,
                    subtitle_path=subtitle_path,
                    burn_subtitles=job.plan.subtitles.burn_in,
                    watermark_path=label_path,
                    cancel_check=lambda: is_job_cancelled(job_id),
                )

            # Final QA
            expected_final_dur = audio_dur
            tolerance = max(0.5, expected_final_dur * 0.10)
            final_qa = check_final(
                video_path=output_path,
                expected_duration=expected_final_dur,
                tolerance=tolerance,
            )
            if not final_qa.get("passed"):
                raise RuntimeError(f"Final QA failed: {final_qa}")

            job.output_path = str(output_path)
            job.subtitle_path = str(subtitle_path) if subtitle_path else None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                job.music_applied = True
            job.state = JobState.COMPLETED

        elif visual_mode in ("text_to_video", "slideshow"):
            # Mode 1: TEXT TO VIDEO
            # 1. Script Generation if prompt was provided without script or if script is merely the prompt
            curr_script = (job.plan.script or "").strip()
            prompt_str = (job.request.prompt or "").strip()
            target_dur = float(job.plan.target_duration_seconds or 10.0)
            is_prompt_verbatim = bool(curr_script and prompt_str and curr_script.lower() == prompt_str.lower())
            is_too_brief = bool(curr_script and len(curr_script.split()) < 15 and target_dur >= 10.0)

            if prompt_str and (not curr_script or is_prompt_verbatim or is_too_brief):
                tone = "friendly"
                if job.request.overrides and "voice.tone" in job.request.overrides:
                    tone = str(job.request.overrides["voice.tone"])
                elif hasattr(job.request, "tone") and job.request.tone:
                    tone = str(job.request.tone)

                job.state = JobState.SCHEDULING_SEGMENTS
                save_job_record(job)

                try:
                    from src.services.script_writer import generate_script
                    gen_res = generate_script(
                        prompt=prompt_str,
                        duration_seconds=target_dur,
                        tone=tone,
                    )
                    ai_script = gen_res.script
                except Exception as exc:
                    logger.warning(f"generate_script failed: {exc}; using template generator.")
                    from src.services.template_script_writer import build_template_script
                    ai_script = build_template_script(
                        idea=prompt_str,
                        duration_seconds=target_dur,
                        tone=tone,
                    )

                job.plan.script = ai_script
                job.timeline = build_timeline(ai_script, job.plan)
                save_job_record(job)

            # 2. Voice Pack
            voice_pack = build_voice_pack(Path(job.voice_path), job_path)
            job.voice_pack = voice_pack

            # 3. Scene Planning
            job.state = JobState.SCHEDULING_SEGMENTS
            save_job_record(job)

            from src.services.scene_planner import plan_scenes
            from src.services.image_provider import get_image_provider
            from src.services.slideshow_compositor import SlideshowCompositor
            from src.utils.images import create_ai_label_png

            style = getattr(job.request, "image_style", settings.image_style) or settings.image_style
            scene_plan = plan_scenes(
                script=job.plan.script,
                style=style,
                words_per_minute=settings.words_per_minute,
            )

            # 3. TTS Synthesis per Scene
            job.state = JobState.SYNTHESIZING_AUDIO
            save_job_record(job)

            if settings.tts_provider.lower() == "cosyvoice":
                from src.services.tts_cosyvoice import CosyVoiceTTSProvider
                tts_provider = CosyVoiceTTSProvider()
            else:
                tts_provider = PiperTTSProvider()

            scene_audio_paths = []
            for i, scene in enumerate(scene_plan.scenes):
                from src.models.schemas import TimelineEvent
                ev = TimelineEvent(
                    event_id=f"scene_event_{i:04d}",
                    type="speech",
                    start_s=scene.start_time,
                    end_s=scene.end_time,
                    text=scene.text,
                )
                tts_res = tts_provider.synthesize_event(
                    event=ev,
                    plan=job.plan,
                    job_path=job_path,
                    voice_sample_path=job.voice_path,
                )
                scene_audio_paths.append(Path(tts_res.audio_path))

            # Validate synthesized speech duration against target duration with automatic tempo adaptation
            total_raw_speech = sum(probe_duration(p) for p in scene_audio_paths)
            target_dur = float(job.plan.target_duration_seconds)
            tolerance = max(1.0, target_dur * 0.12)
            min_allowed = target_dur - tolerance
            max_allowed = target_dur + tolerance

            if (total_raw_speech < min_allowed or total_raw_speech > max_allowed) and target_dur > 0:
                speech_ratio = total_raw_speech / target_dur
                if 0.75 <= speech_ratio <= 1.35:
                    logger.info(
                        f"Slideshow speech duration ({total_raw_speech:.2f}s) is slightly off target ({target_dur:.2f}s); "
                        f"automatically adapting scene speech tempos..."
                    )
                    adapted_paths = []
                    for idx, sp in enumerate(scene_audio_paths):
                        sc_dur = probe_duration(sp)
                        target_sc_dur = sc_dur / speech_ratio
                        adapted_sc = job_path / f"adapted_scene_audio_{idx:04d}.wav"
                        if adapt_audio_tempo(sp, adapted_sc, target_sc_dur):
                            adapted_paths.append(adapted_sc)
                        else:
                            adapted_paths.append(sp)
                    scene_audio_paths = adapted_paths
                    total_raw_speech = sum(probe_duration(p) for p in scene_audio_paths)

            if total_raw_speech < min_allowed or total_raw_speech > max_allowed:
                raise RuntimeError(
                    f"TTS speech audio duration ({total_raw_speech:.2f}s) is outside tolerance "
                    f"of requested duration ({target_dur:.2f}s) [{min_allowed:.2f}s - {max_allowed:.2f}s]. "
                    f"Consider adjusting script length ({len(job.plan.script.split())} words)."
                )

            # 4. Generate Visual Media for each scene (Genuine AI Video or Procedural Slideshow)
            job.state = JobState.GENERATING_SEGMENTS
            save_job_record(job)

            from src.services.video_provider import get_video_provider, VideoProviderError
            prefer_slideshow = (
                getattr(job.request, "prefer_slideshow", False)
                or getattr(job.request, "visual_mode", "") == "slideshow"
            )
            vid_provider = get_video_provider(prefer_slideshow=prefer_slideshow)
            acc_status = vid_provider.check_account_status() if hasattr(vid_provider, "check_account_status") else {"status": "unconfigured"}

            label_path = job_path / "ai_label.png"
            from src.utils.images import create_ai_label_png
            label_text = (job.plan.safety.label_text if job.plan and job.plan.safety and job.plan.safety.label_text else "AI-generated")
            create_ai_label_png(label_path, label_text)

            bg_music_path = None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                music_preset = job.request.music_preset_id or getattr(settings, "default_music_preset", "calm") or "calm"
                try:
                    from src.services.music_presets import resolve_job_music_path
                    bg_music_path = resolve_job_music_path(job.request.music_asset_id, music_preset)
                    job.music_applied = True
                except Exception as exc:
                    logger.warning(f"Could not resolve background music preset '{music_preset}': {exc}")
                    job.music_applied = False

            bg_music_vol = job.request.music_volume if job.request.music_volume is not None else 0.2

            if not prefer_slideshow and getattr(vid_provider, "is_configured", False) and acc_status.get("status") == "ready":
                # Genuine Neural AI Video Generation
                logger.info(f"Generating genuine AI video scenes via {vid_provider.name} ({vid_provider.model})...")
                scene_video_paths = []
                for idx, scene in enumerate(scene_plan.scenes):
                    if is_job_cancelled(job_id):
                        return
                    sc_audio = scene_audio_paths[idx]
                    sc_dur = probe_duration(sc_audio)
                    vid_res = vid_provider.generate_text_to_video(
                        prompt=scene.image_prompt,
                        duration_seconds=sc_dur,
                        job_path=job_path,
                    )
                    scene_video_paths.append(vid_res.video_path)

                job.state = JobState.ASSEMBLING
                save_job_record(job)

                output_path, subtitle_path = SlideshowCompositor.compose_scenes_video_job(
                    job_path=job_path,
                    plan=job.plan,
                    scenes=scene_plan.scenes,
                    scene_audio_paths=scene_audio_paths,
                    scene_clips=scene_video_paths,
                    bg_music_path=bg_music_path,
                    bg_music_volume=bg_music_vol,
                    burn_subtitles=job.plan.subtitles.burn_in,
                    subtitles_enabled=job.plan.subtitles.enabled,
                    watermark_path=label_path,
                    cancel_check=lambda: is_job_cancelled(job_id),
                )
                job.visual_mode_used = "text_to_video"
                job.visual_mode_reason = f"Authentic AI video clips synthesized via {vid_provider.name} ({vid_provider.model})."
            elif not prefer_slideshow and getattr(vid_provider, "is_configured", False) and acc_status.get("status") == "exhausted_balance" and not getattr(settings, "file_ai_mock_fallback", True):
                raise VideoProviderError(
                    f"{vid_provider.name} Video Generation blocked: {acc_status['message']}. "
                    "Please top up your balance or configure GEMINI_API_KEY (for Google Veo) to generate genuine AI videos."
                )
            else:
                # Procedural Ken Burns Slideshow
                image_provider = get_image_provider(
                    provider_name=settings.image_provider,
                    source_image_path=Path(job.photo_path) if job.photo_path and Path(job.photo_path).exists() else None,
                )
                scene_images = []
                for scene in scene_plan.scenes:
                    if is_job_cancelled(job_id):
                        return
                    img_res = image_provider.generate(
                        prompt=scene.image_prompt,
                        style=scene.style,
                        seed=job.plan.seed + scene.scene_index,
                        key_phrase=scene.key_phrase,
                    )
                    scene_images.append(img_res.path)

                if is_job_cancelled(job_id):
                    return

                job.state = JobState.ASSEMBLING
                save_job_record(job)

                output_path, subtitle_path = SlideshowCompositor.compose_slideshow_job(
                    job_path=job_path,
                    plan=job.plan,
                    scenes=scene_plan.scenes,
                    scene_audio_paths=scene_audio_paths,
                    scene_images=scene_images,
                    bg_music_path=bg_music_path,
                    bg_music_volume=bg_music_vol,
                    burn_subtitles=job.plan.subtitles.burn_in,
                    subtitles_enabled=job.plan.subtitles.enabled,
                    watermark_path=label_path,
                    cancel_check=lambda: is_job_cancelled(job_id),
                )
                job.visual_mode_used = "slideshow" if prefer_slideshow else "text_to_video"
                job.visual_mode_reason = "Cinematic camera motion slideshow composited locally."

            expected_final_dur = float(job.plan.target_duration_seconds)
            tolerance = expected_final_dur * 0.10

            final_qa = check_final(
                video_path=output_path,
                expected_duration=expected_final_dur,
                tolerance=tolerance,
            )

            if not final_qa.get("passed"):
                raise RuntimeError(f"Final QA failed: {final_qa}")

            job.output_path = str(output_path)
            job.subtitle_path = str(subtitle_path) if subtitle_path else None
            job.visual_mode_used = "text_to_video" if visual_mode == "text_to_video" else "slideshow"
            job.visual_mode_reason = f"{visual_mode.replace('_', ' ').capitalize()} generation completed."
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                job.music_applied = True
            job.state = JobState.COMPLETED

        elif visual_mode == "picture_to_video":
            # Mode 2: PICTURE TO VIDEO
            job.visual_mode_used = "picture_to_video"
            job.visual_mode_reason = "Picture-to-Video generation selected."
            save_job_record(job)

            input_image_path = Path(job.photo_path)
            audio_mode = getattr(job.request, "audio_mode", "ai_generated")

            # 1. Resolve Audio (Preserve original user audio; otherwise default to AI-generated narration)
            has_user_audio = bool(
                audio_mode == "original_audio"
                or job.request.uploaded_audio_asset_id
                or job.request.voice_asset_id
                or (job.voice_path and Path(job.voice_path).exists() and not job.request.voice_preset_id)
            )
            if has_user_audio and job.voice_path and Path(job.voice_path).exists():
                speech_audio_path = Path(job.voice_path)
                audio_dur = probe_duration(speech_audio_path)
            else:
                # AI-generated audio enabled by default
                job.state = JobState.SYNTHESIZING_AUDIO
                save_job_record(job)

                from src.clients.file_ai import get_file_ai_client
                client = get_file_ai_client()
                script_text = job.plan.script
                if not script_text or not script_text.strip():
                    if job.request.prompt:
                        script_text = client.generate_script(
                            prompt=job.request.prompt,
                            target_duration_seconds=float(job.plan.target_duration_seconds or 5.0),
                        )
                    else:
                        script_text = "Bringing your still picture to life with high quality animation."
                    job.plan.script = script_text

                if settings.tts_provider.lower() == "cosyvoice":
                    from src.services.tts_cosyvoice import CosyVoiceTTSProvider
                    tts_provider = CosyVoiceTTSProvider()
                else:
                    tts_provider = PiperTTSProvider()

                from src.models.schemas import TimelineEvent
                ev = TimelineEvent(
                    event_id="p2v_speech",
                    type="speech",
                    start_s=0.0,
                    end_s=float(job.plan.target_duration_seconds or 5.0),
                    text=job.plan.script,
                )
                tts_res = tts_provider.synthesize_event(
                    event=ev,
                    plan=job.plan,
                    job_path=job_path,
                    voice_sample_path=job.voice_path,
                )
                speech_audio_path = Path(tts_res.audio_path)
                audio_dur = probe_duration(speech_audio_path)

            # 2. Visual Synthesis: Genuine AI Video (Minimax/fal.ai) or Talking Head (Wav2Lip) or Ken Burns
            from src.services.face_detector import count_faces_in_image
            from src.services.capabilities import is_wav2lip_available
            from src.services.slideshow_compositor import SlideshowCompositor
            from src.services.video_provider import FalAIVideoProvider, VideoProviderError

            faces_count = count_faces_in_image(input_image_path)
            wav2lip_avail = is_wav2lip_available()
            prefer_slideshow = (
                getattr(job.request, "prefer_slideshow", False)
                or getattr(job.request, "visual_mode", "") == "slideshow"
            )

            job.state = JobState.GENERATING_SEGMENTS
            save_job_record(job)

            from src.services.video_provider import get_video_provider, VideoProviderError
            vid_provider = get_video_provider(prefer_slideshow=prefer_slideshow)
            if not prefer_slideshow and getattr(vid_provider, "is_configured", False):
                # Genuine AI Video Generation (preserving subject identity & appearance)
                acc_status = vid_provider.check_account_status()
                if acc_status["status"] == "ready":
                    logger.info(f"Generating genuine AI video using {vid_provider.name} ({vid_provider.model})...")
                    p2v_prompt = job.request.prompt or (job.plan.script if job.plan else "cinematic natural motion")
                    vid_result = vid_provider.generate_image_to_video(
                        image_path=input_image_path,
                        prompt=p2v_prompt,
                        duration_seconds=audio_dur,
                        audio_path=speech_audio_path,
                        job_path=job_path,
                    )
                    video_path = vid_result.video_path
                    job.visual_mode_used = "picture_to_video"
                    job.visual_mode_reason = vid_result.reason
                elif acc_status["status"] == "exhausted_balance":
                    # Transparently report exhausted balance so user can top up
                    if not getattr(settings, "file_ai_mock_fallback", True):
                        raise VideoProviderError(
                            f"{vid_provider.name} Video Generation blocked: {acc_status['message']}. "
                            "Please top up your balance or configure GEMINI_API_KEY (for Google Veo) to generate genuine AI videos."
                        )
                    logger.warning(f"{vid_provider.name} Video Generation balance exhausted; mock fallback active: {acc_status['message']}")
                    ken_burns_path = job_path / "animated_photo.mp4"
                    SlideshowCompositor.render_scene_clip(
                        image_path=input_image_path,
                        duration_s=audio_dur,
                        motion_idx=0,
                        output_path=ken_burns_path,
                        fps=30,
                    )
                    video_path = ken_burns_path
                    job.visual_mode_used = "picture_to_video"
                    job.visual_mode_reason = f"Sandbox test fallback: {acc_status['message']}"
                elif not getattr(settings, "file_ai_mock_fallback", True):
                    raise VideoProviderError(f"AI Video Provider error: {acc_status['message']}")
                else:
                    # In offline test/sandbox fallback mode
                    ken_burns_path = job_path / "animated_photo.mp4"
                    SlideshowCompositor.render_scene_clip(
                        image_path=input_image_path,
                        duration_s=audio_dur,
                        motion_idx=0,
                        output_path=ken_burns_path,
                        fps=30,
                    )
                    video_path = ken_burns_path
                    job.visual_mode_used = "picture_to_video"
                    job.visual_mode_reason = f"Test sandbox compositor used ({acc_status['status']})."

            elif faces_count >= 1 and wav2lip_avail and not prefer_slideshow:
                job.state = JobState.PREPARING_IDENTITY
                save_job_record(job)

                id_builder = RealIdentityBuilder()
                job.identity_pack = id_builder.build_identity_pack(input_image_path, job_path)
                voice_pack = build_voice_pack(speech_audio_path, job_path)
                job.voice_pack = voice_pack

                from src.models.schemas import SegmentSpec, TimelineEvent
                seg_ev = TimelineEvent(
                    event_id="p2v_lip",
                    type="speech",
                    start_s=0.0,
                    end_s=round(audio_dur, 2),
                    text=job.plan.script or "Spoken audio",
                )
                segment = SegmentSpec(
                    segment_id="segment_0000",
                    start_s=0.0,
                    duration_s=audio_dur,
                    events=[seg_ev],
                )

                anim_provider = RealWav2LipProvider()
                video_path = anim_provider.generate_segment(
                    segment=segment,
                    plan=job.plan,
                    job_path=job_path,
                    identity_pack=job.identity_pack,
                    voice_pack=job.voice_pack,
                )
                job.visual_mode_used = "picture_to_video"
                job.visual_mode_reason = "Wav2Lip neural lip-sync talking head generated."
            else:
                reason = "Ken Burns slideshow compositor used: "
                if faces_count == 0:
                    reason += "no clear face detected in uploaded photo."
                elif not wav2lip_avail:
                    reason += "Wav2Lip model is not available in this environment."
                else:
                    reason += "Ken Burns slideshow chosen by user."

                ken_burns_path = job_path / "animated_photo.mp4"
                SlideshowCompositor.render_scene_clip(
                    image_path=input_image_path,
                    duration_s=audio_dur,
                    motion_idx=0,
                    output_path=ken_burns_path,
                    fps=30,
                )
                video_path = ken_burns_path
                job.visual_mode_used = "picture_to_video"
                job.visual_mode_reason = reason

            # 3. Subtitles
            subtitle_path = None
            if getattr(job.request, "auto_subtitles", False) or (job.plan.subtitles and job.plan.subtitles.enabled):
                from src.services.subtitles import generate_webvtt
                from src.models.schemas import Timeline, TimelineEvent, TTSSegment
                sub_p = job_path / "subtitles.vtt"
                ev = TimelineEvent(
                    event_id="speech_0000",
                    type="speech",
                    start_s=0.0,
                    end_s=round(audio_dur, 2),
                    text=job.plan.script or "Uploaded audio",
                )
                sub_tl = Timeline(events=[ev], total_duration_seconds=round(audio_dur, 2))
                tts_map = {"speech_0000": TTSSegment(event_id="speech_0000", audio_path=str(speech_audio_path), duration_seconds=round(audio_dur, 2))}
                generate_webvtt(sub_tl, tts_map, sub_p)
                subtitle_path = sub_p

            # 4. Assembly & AI Label Watermark
            job.state = JobState.ASSEMBLING
            save_job_record(job)

            label_path = job_path / "ai_label.png"
            from src.utils.images import create_ai_label_png
            label_text = (job.plan.safety.label_text if job.plan and job.plan.safety and job.plan.safety.label_text else "AI-generated")
            create_ai_label_png(label_path, label_text)

            output_path = job_path / "final_video.mp4"
            from src.utils.ffmpeg import finalize_video, mix_background_music

            final_speech_audio = speech_audio_path
            music_id = job.request.music_preset_id or job.request.music_asset_id
            if music_id and job.music_applied is not False:
                try:
                    from src.services.music_presets import resolve_job_music_path
                    m_path = resolve_job_music_path(job.request.music_asset_id, job.request.music_preset_id)
                    if m_path and m_path.exists():
                        mixed_audio = job_path / "final_audio_with_music.wav"
                        mix_background_music(
                            speech_path=speech_audio_path,
                            music_path=m_path,
                            output_path=mixed_audio,
                            target_duration=audio_dur,
                            volume=job.request.music_volume,
                            ducking=job.request.music_ducking,
                        )
                        final_speech_audio = mixed_audio
                        job.music_applied = True
                except Exception as exc:
                    logger.warning(f"Background music mixing failed: {exc}; continuing without music.")
                    job.music_applied = False

            burn_sub = bool(job.plan.subtitles and job.plan.subtitles.burn_in)
            finalize_video(
                video_path=video_path,
                audio_path=final_speech_audio,
                watermark_path=label_path,
                output_path=output_path,
                duration=audio_dur,
                subtitle_path=subtitle_path,
                burn_subtitles=burn_sub,
            )

            expected_final_dur = audio_dur
            tolerance = max(0.5, expected_final_dur * 0.12)
            final_qa = check_final(video_path=output_path, expected_duration=expected_final_dur, tolerance=tolerance)
            if not final_qa.get("passed"):
                raise RuntimeError(f"Final QA failed: {final_qa}")

            job.output_path = str(output_path)
            job.subtitle_path = str(subtitle_path) if subtitle_path else None
            job.state = JobState.COMPLETED

        elif visual_mode == "ai_clips":
            # 1. Voice Pack
            voice_pack = build_voice_pack(Path(job.voice_path), job_path)
            job.voice_pack = voice_pack

            # 2. Scene Planning / Resolution
            job.state = JobState.SCHEDULING_SEGMENTS
            save_job_record(job)

            from src.services.scene_planner import plan_scenes
            from src.services.clip_compositor import ClipCompositor

            clip_paths = []
            for cid in job.clip_asset_ids:
                p = get_asset_path(cid)
                if p and p.exists():
                    clip_paths.append(p)
            if not clip_paths:
                raise RuntimeError("No valid clip files found for ai_clips job.")

            script_text = job.plan.script if job.plan and job.plan.script else ""
            scene_plan = plan_scenes(
                script=script_text or "Visual scene narration.",
                style=getattr(job.request, "image_style", "cinematic"),
                words_per_minute=settings.words_per_minute,
            )

            # 3. Audio synthesis / alignment per scene
            job.state = JobState.SYNTHESIZING_AUDIO
            save_job_record(job)

            if settings.tts_provider.lower() == "cosyvoice":
                from src.services.tts_cosyvoice import CosyVoiceTTSProvider
                tts_provider = CosyVoiceTTSProvider()
            else:
                tts_provider = PiperTTSProvider()

            scene_audio_paths = []
            scene_texts = []
            for i, scene in enumerate(scene_plan.scenes):
                from src.models.schemas import TimelineEvent
                ev = TimelineEvent(
                    event_id=f"scene_event_{i:04d}",
                    type="speech",
                    start_s=scene.start_time,
                    end_s=scene.end_time,
                    text=scene.text,
                )
                tts_res = tts_provider.synthesize_event(
                    event=ev,
                    plan=job.plan,
                    job_path=job_path,
                    voice_sample_path=job.voice_path,
                )
                scene_audio_paths.append(Path(tts_res.audio_path))
                scene_texts.append(scene.text)

            scene_durations = [round(probe_duration(p), 2) for p in scene_audio_paths]

            # 4. Assembly
            job.state = JobState.ASSEMBLING
            save_job_record(job)

            label_path = job_path / "ai_label.png"
            from src.utils.images import create_ai_label_png
            label_text = (
                job.plan.safety.label_text
                if job.plan and job.plan.safety and job.plan.safety.label_text
                else "AI-generated"
            )
            create_ai_label_png(label_path, label_text)

            bg_music_path = None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                from src.services.music_presets import resolve_job_music_path
                bg_music_path = resolve_job_music_path(job.request.music_asset_id, job.request.music_preset_id)

            output_path, subtitle_path = ClipCompositor.compose_clips_job(
                job_path=job_path,
                plan=job.plan,
                clip_paths=clip_paths,
                scene_durations=scene_durations,
                scene_audio_paths=scene_audio_paths,
                scene_texts=scene_texts,
                bg_music_path=bg_music_path,
                bg_music_volume=job.request.music_volume,
                burn_subtitles=job.plan.subtitles.burn_in,
                subtitles_enabled=job.plan.subtitles.enabled,
                watermark_path=label_path,
                cancel_check=lambda: is_job_cancelled(job_id),
            )

            job.output_path = str(output_path)
            job.subtitle_path = str(subtitle_path) if subtitle_path else None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                job.music_applied = True
            job.state = JobState.COMPLETED

        else:
            # 1. Identity Pack (Talking head mode)
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

            # Validate synthesized speech audio duration right after TTS completes
            from src.utils.ffmpeg import concat_wavs
            audio_paths = []
            for event in job.timeline.events:
                tts_seg = tts_map.get(event.event_id)
                if tts_seg and Path(tts_seg.audio_path).exists():
                    audio_paths.append(tts_seg.audio_path)

            temp_audio = job_path / "tts_raw_speech.wav"
            concat_wavs(audio_paths, temp_audio)

            raw_tts_dur = probe_duration(temp_audio) if temp_audio.exists() else 0.0
            target_dur = float(job.plan.target_duration_seconds)
            tolerance = max(1.0, target_dur * 0.10)
            min_allowed = target_dur - tolerance
            max_allowed = target_dur + tolerance

            # If speech duration is moderately off (0.75x to 1.35x), automatically adapt tempo
            if (raw_tts_dur < min_allowed or raw_tts_dur > max_allowed) and target_dur > 0:
                speech_ratio = raw_tts_dur / target_dur
                if 0.75 <= speech_ratio <= 1.35:
                    logger.info(
                        f"Speech duration ({raw_tts_dur:.2f}s) is slightly off target ({target_dur:.2f}s); "
                        f"automatically adapting speech tempo to fit within tolerance..."
                    )
                    adapted_speech = job_path / "tts_speech_adapted.wav"
                    if adapt_audio_tempo(temp_audio, adapted_speech, target_dur):
                        adapted_dur = probe_duration(adapted_speech)
                        if min_allowed <= adapted_dur <= max_allowed:
                            raw_tts_dur = adapted_dur
                            temp_audio = adapted_speech

            if raw_tts_dur < min_allowed or raw_tts_dur > max_allowed:
                raise RuntimeError(
                    f"TTS speech audio duration ({raw_tts_dur:.2f}s) is outside tolerance "
                    f"of requested duration ({target_dur:.2f}s) [{min_allowed:.2f}s - {max_allowed:.2f}s]. "
                    f"Consider adjusting script length ({len(job.plan.script.split())} words)."
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
                if is_job_cancelled(job_id):
                    return
                logger.info(f"Generating segment {segment.segment_id} ({segment.duration_s}s)...")
                video_path = anim_provider.generate_segment(
                    segment=segment,
                    plan=job.plan,
                    job_path=job_path,
                    identity_pack=job.identity_pack,
                    voice_pack=job.voice_pack,
                )
                segment.video_path = str(video_path)

                segment_audio = job_path / f"{segment.segment_id}_merged.wav"
                expected_seg_dur = probe_duration(segment_audio) if segment_audio.exists() else segment.duration_s

                qa_result = check_segment(
                    video_path=segment.video_path,
                    expected_duration=expected_seg_dur,
                )
                if not qa_result.get("passed"):
                    raise RuntimeError(f"Segment QA failed for {segment.segment_id}: {qa_result}")

            if is_job_cancelled(job_id):
                return

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

            expected_final_dur = float(job.plan.target_duration_seconds)
            tolerance = expected_final_dur * 0.10

            final_qa = check_final(
                video_path=output_path,
                expected_duration=expected_final_dur,
                tolerance=tolerance,
            )

            if not final_qa.get("passed"):
                raise RuntimeError(f"Final QA failed: {final_qa}")

            job.output_path = str(output_path)
            job.subtitle_path = str(subtitle_path) if subtitle_path else None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                job.music_applied = True
            job.state = JobState.COMPLETED

    except Exception as exc:
        if is_job_cancelled(job_id) or "cancelled by user" in str(exc).lower():
            logger.info(f"Job execution stopped due to cancellation: {job_id}")
            job.state = JobState.CANCELLED
            job.error = "Job was cancelled by the user."
        else:
            from src.clients.file_ai import _sanitize_error_message
            clean_err = _sanitize_error_message(str(exc))
            logger.error(f"Job execution failed for {job_id}: {type(exc).__name__}: {clean_err}")
            job.state = JobState.FAILED
            job.error = f"{type(exc).__name__}: {clean_err}"
            if job.music_applied is not True and (job.request.music_asset_id or job.request.music_preset_id):
                job.music_applied = False
                if not job.music_error:
                    job.music_error = clean_err
                    job.music_failure_reason = clean_err

    finally:
        if should_save_and_cleanup and job is not None and job_path is not None:
            save_job_record(job)
            try:
                manifest_path = job_path / "manifest.json"
                manifest_path.write_text(
                    job.model_dump_json(indent=2),
                    encoding="utf-8",
                )
            except Exception:
                pass
            _cleanup_intermediate_job_files(
                job_path,
                is_failed=(job.state == JobState.FAILED),
                is_cancelled=(job.state == JobState.CANCELLED),
                updated_at=job.updated_at,
            )
        with _EXECUTING_JOBS_LOCK:
            _EXECUTING_JOB_IDS.discard(job_id)
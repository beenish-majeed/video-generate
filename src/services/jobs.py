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
from src.utils.ffmpeg import probe_duration, adapt_audio_tempo


logger = logging.getLogger(__name__)
DB_PATH = settings.storage_dir / "jobs.db"


def _init_db() -> None:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


from src.services.job_cache import (
    BoundedJobCache,
    TERMINAL_JOB_STATES,
    RUNNING_JOB_STATES,
    NON_TERMINAL_STATES,
)
from src.services.job_recovery import recover_interrupted_jobs


_init_db()
JOBS: BoundedJobCache = BoundedJobCache(maxsize=100)


def save_job_record(job: JobRecord, update_timestamp: bool = True) -> None:
    if update_timestamp or not job.updated_at:
        job.updated_at = utcnow()
    JOBS[job.job_id] = job
    try:
        data_json = job.model_dump_json()
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
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
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
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
                    except Exception:
                        pass
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

    # Remove from in-memory cache
    JOBS.pop(job_id, None)

    # Remove from SQLite
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
            conn.commit()
    except Exception as exc:
        logger.error(f"Error deleting job '{job_id}' from DB: {exc}")

    return True


def create_job(request: JobCreate) -> JobRecord:
    job_id = f"job_{uuid4().hex}"

    is_my_own = bool(request.uploaded_image_asset_ids)
    is_preset_path = bool((request.avatar_preset_id or request.visual_mode == "slideshow") and request.voice_preset_id)

    if is_my_own:
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
        is_preset_path=is_preset_path,
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
        photo_path=str(photo_path),
        voice_path=str(voice_path),
        consent=consent,
        plan=plan,
        timeline=timeline,
        music_asset_id=request.music_asset_id,
        music_preset_id=request.music_preset_id,
        music_volume=request.music_volume,
        music_ducking=request.music_ducking,
        music_applied=None,
    )

    from datetime import timedelta
    dur = float(plan.target_duration_seconds)
    render_mult = 2.7 if getattr(request, "visual_mode", "talking_head") == "talking_head" else 0.85
    job.estimated_render_seconds = round(dur * render_mult, 1)
    job.retention_expires_at = job.created_at + timedelta(hours=settings.job_retention_hours)

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

    if is_job_cancelled(job_id):
        return

    is_my_own = bool(getattr(job.request, "uploaded_image_asset_ids", None))
    visual_mode = getattr(job.request, "visual_mode", "talking_head")

    try:
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
                    "-select_streams",
                    "a:0",
                    "-show_entries",
                    "stream=codec_type:format=duration",
                    "-of",
                    "json",
                    str(music_file),
                ]
                probe_res = run_subprocess(probe_cmd)
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
                    "-i",
                    str(music_file),
                    "-f",
                    "null",
                    "-",
                ]
                dec_proc = run_subprocess(dec_cmd)
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
            from src.services.face_detector import evaluate_visual_mode
            prefer_lip_sync = getattr(job.request, "prefer_lip_sync", False)
            mode_used, mode_reason, face_image_path = evaluate_visual_mode(
                image_paths=image_paths,
                prefer_lip_sync=prefer_lip_sync,
            )
            job.visual_mode_used = mode_used
            job.visual_mode_reason = mode_reason
            save_job_record(job)

            # 3. Subtitles (auto-subtitles or plan subtitles)
            subtitle_path = None
            if getattr(job.request, "auto_subtitles", False) or job.plan.subtitles.enabled:
                from src.services.speech_to_text import is_whisper_available, transcribe_audio_to_webvtt
                if is_whisper_available():
                    sub_p = job_path / "subtitles.vtt"
                    subtitle_path = transcribe_audio_to_webvtt(speech_audio_path, sub_p)
                elif job.plan.subtitles.enabled and job.plan.script:
                    from src.services.subtitles import generate_webvtt
                    from src.models.schemas import Timeline, TimelineEvent, TTSSegment
                    sub_p = job_path / "subtitles.vtt"
                    ev = TimelineEvent(
                        event_id="speech_0000",
                        type="speech",
                        start_s=0.0,
                        end_s=round(audio_dur, 2),
                        text=job.plan.script,
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

        elif visual_mode == "slideshow":
            # 1. Voice Pack
            voice_pack = build_voice_pack(Path(job.voice_path), job_path)
            job.voice_pack = voice_pack

            # 2. Scene Planning
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

            # 4. Generate Images for each scene
            job.state = JobState.GENERATING_SEGMENTS
            save_job_record(job)

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

            # 5. Assembly
            job.state = JobState.ASSEMBLING
            save_job_record(job)

            label_path = job_path / "ai_label.png"
            from src.utils.images import create_ai_label_png
            label_text = (job.plan.safety.label_text if job.plan and job.plan.safety and job.plan.safety.label_text else "AI-generated")
            create_ai_label_png(label_path, label_text)

            bg_music_path = None
            if (job.request.music_asset_id or job.request.music_preset_id) and job.music_applied is not False:
                from src.services.music_presets import resolve_job_music_path
                bg_music_path = resolve_job_music_path(job.request.music_asset_id, job.request.music_preset_id)

            output_path, subtitle_path = SlideshowCompositor.compose_slideshow_job(
                job_path=job_path,
                plan=job.plan,
                scenes=scene_plan.scenes,
                scene_audio_paths=scene_audio_paths,
                scene_images=scene_images,
                bg_music_path=bg_music_path,
                bg_music_volume=job.request.music_volume,
                burn_subtitles=job.plan.subtitles.burn_in,
                subtitles_enabled=job.plan.subtitles.enabled,
                watermark_path=label_path,
                cancel_check=lambda: is_job_cancelled(job_id),
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
            logger.exception(f"Job execution failed for {job_id}: {exc}")
            job.state = JobState.FAILED
            job.error = f"{type(exc).__name__}: {exc}"
            if job.music_applied is not True and (job.request.music_asset_id or job.request.music_preset_id):
                job.music_applied = False
                if not job.music_error:
                    job.music_error = str(exc)
                    job.music_failure_reason = str(exc)

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
        _cleanup_intermediate_job_files(
            job_path,
            is_failed=(job.state == JobState.FAILED),
            is_cancelled=(job.state == JobState.CANCELLED),
            updated_at=job.updated_at,
        )
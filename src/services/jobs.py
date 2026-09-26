from pathlib import Path
from uuid import uuid4

from src.config import settings
from src.models.schemas import JobCreate, JobRecord, JobState, utcnow
from src.services.animation import MockAnimationProvider
from src.services.assembler import assemble
from src.services.consent import verify_consent
from src.services.identity import build_identity_pack
from src.services.lipsync import MockLipSyncProvider
from src.services.prompt_compiler import compile_plan
from src.services.qa import check_final, check_segment
from src.services.segment_scheduler import split_timeline
from src.services.store import get_asset_path, job_dir
from src.services.timeline_planner import build_timeline
from src.services.tts import MockTTSProvider
from src.services.voice import build_voice_pack

JOBS: dict[str, JobRecord] = {}


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

    plan = compile_plan(
        job_id=job_id,
        script=request.script,
        prompt=request.prompt,
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

    JOBS[job_id] = job

    return job


def get_job(job_id: str) -> JobRecord | None:
    return JOBS.get(job_id)


def run_job(job_id: str) -> None:
    job = JOBS.get(job_id)

    if job is None:
        return

    if job.plan is None or job.timeline is None:
        job.state = JobState.FAILED
        job.error = "Job plan or timeline is missing."
        return

    job_path = job_dir(job_id)

    try:
        job.state = JobState.PREPARING_IDENTITY
        job.updated_at = utcnow()

        job.identity_pack = build_identity_pack(Path(job.photo_path), job_path)
        job.voice_pack = build_voice_pack(Path(job.voice_path), job_path)

        job.state = JobState.SYNTHESIZING_AUDIO
        job.updated_at = utcnow()

        tts_provider = MockTTSProvider()
        tts_map = {}

        for event in job.timeline.events:
            tts_map[event.event_id] = tts_provider.synthesize_event(
                event=event,
                plan=job.plan,
                job_path=job_path,
            )

        job.state = JobState.SCHEDULING_SEGMENTS
        job.updated_at = utcnow()

        segments = split_timeline(
            timeline=job.timeline,
            max_segment_seconds=settings.max_segment_seconds,
        )

        job.state = JobState.GENERATING_SEGMENTS
        job.updated_at = utcnow()

        animation_provider = MockAnimationProvider()
        lipsync_provider = MockLipSyncProvider()

        for segment in segments:
            video_path = animation_provider.generate_segment(
                segment=segment,
                plan=job.plan,
                job_path=job_path,
                identity_pack=job.identity_pack,
                voice_pack=job.voice_pack,
            )

            segment.video_path = str(video_path)

            refined_path = lipsync_provider.refine_segment(
                segment=segment,
                plan=job.plan,
                job_path=job_path,
                identity_pack=job.identity_pack,
                voice_pack=job.voice_pack,
            )

            segment.video_path = str(refined_path)

            qa_result = check_segment(
                video_path=segment.video_path,
                expected_duration=segment.duration_s,
            )

            if not qa_result.get("passed"):
                raise RuntimeError(
                    f"Segment QA failed for {segment.segment_id}: {qa_result}"
                )

        job.segments = segments

        job.state = JobState.QA_CHECKING
        job.updated_at = utcnow()

        job.state = JobState.ASSEMBLING
        job.updated_at = utcnow()

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
        job.state = JobState.FAILED
        job.error = f"{type(exc).__name__}: {exc}"

    finally:
        job.updated_at = utcnow()

        try:
            manifest_path = job_path / "manifest.json"
            manifest_path.write_text(
                job.model_dump_json(indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass
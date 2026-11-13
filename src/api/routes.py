import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, PlainTextResponse

from src.api.dependencies import (
    check_job_creation_rate_limit,
    check_script_rate_limit,
    check_upload_rate_limit,
    get_current_session_id,
    verify_api_key,
)
from src.core.config import settings
from src.models.schemas import (
    JobCreate,
    JobEstimateRequest,
    JobEstimateResponse,
    JobRecord,
    JobState,
    ScenePlanRequest,
    ScenePlanResponse,
    ScriptGenerateRequest,
    ScriptGenerateResponse,
)
from src.services.capabilities import get_system_capabilities, is_whisper_available
from src.services.jobs import (
    cancel_job,
    count_active_jobs,
    create_job,
    delete_job_record,
    load_job_record,
    list_all_jobs,
    run_job,
    save_job_record,
)
from src.services.llm import LLMError
from src.services.music_presets import get_music_presets
from src.services.presets import get_all_presets, get_avatar_file_path, is_valid_avatar_preset_id
from src.services.script_writer import ScriptWriterError, generate_script
from src.services.store import save_upload

logger = logging.getLogger(__name__)

router = APIRouter()

JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="JobWorker")
JOB_CREATION_LOCK = threading.Lock()


def get_job_executor() -> ThreadPoolExecutor:
    global JOB_EXECUTOR
    if getattr(JOB_EXECUTOR, "_shutdown", False):
        JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="JobWorker")
    return JOB_EXECUTOR


# =============================================================================
# Health & Capabilities
# =============================================================================

@router.get("/health")
def health():
    return {"ok": True}


@router.get("/v1/capabilities", dependencies=[Depends(verify_api_key)])
def get_capabilities_endpoint(
    mode: Optional[str] = Query(None),
    duration_seconds: Optional[float] = Query(None),
):
    valid_modes = {"text_to_video", "picture_to_video", "slideshow", "talking_head"}
    if mode is not None and mode not in valid_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid generation mode '{mode}'. Canonical modes: 'text_to_video', 'picture_to_video'.",
        )
    return get_system_capabilities(mode=mode, duration_seconds=duration_seconds)


@router.get("/v1/durations")
def get_duration_options():
    return {
        "words_per_minute": settings.words_per_minute,
        "min_duration_seconds": settings.min_duration_seconds,
        "max_duration_policy_seconds": settings.max_duration_policy_seconds,
        "auto_subtitles_available": is_whisper_available(),
        "allowed_presets": [
            {"label": "5 seconds", "value": "5s", "seconds": 5.0},
            {"label": "30 seconds", "value": "30s", "seconds": 30.0},
            {"label": "1 minute", "value": "1m", "seconds": 60.0},
            {"label": "2 minutes", "value": "2m", "seconds": 120.0},
            {"label": "3 minutes", "value": "3m", "seconds": 180.0},
            {"label": "5 minutes", "value": "5m", "seconds": 300.0},
            {"label": "10 minutes", "value": "10m", "seconds": 600.0},
        ],
    }


# =============================================================================
# Presets
# =============================================================================

@router.get("/v1/presets", dependencies=[Depends(verify_api_key)])
def get_presets_endpoint():
    data = get_all_presets()
    avatars = [
        {
            "id": a["id"],
            "name": a.get("name", a["id"]),
            "thumbnail_url": f"/v1/presets/avatars/{a['id']}/thumbnail",
        }
        for a in data.get("avatars", [])
        if "id" in a
    ]
    voices = [
        {
            "id": v["id"],
            "name": v.get("name", v["id"]),
        }
        for v in data.get("voices", [])
        if "id" in v
    ]
    return {"avatars": avatars, "voices": voices}


@router.get("/v1/music-presets", dependencies=[Depends(verify_api_key)])
def list_music_presets_endpoint():
    return get_music_presets()


@router.get("/v1/presets/avatars/{avatar_id}/thumbnail", dependencies=[Depends(verify_api_key)])
def get_avatar_thumbnail(avatar_id: str):
    if not is_valid_avatar_preset_id(avatar_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Avatar preset '{avatar_id}' not found.",
        )
    file_path = get_avatar_file_path(avatar_id)
    if not file_path or not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Avatar thumbnail file not found for '{avatar_id}'.",
        )
    media_type = "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path=str(file_path), media_type=media_type)


# =============================================================================
# Script & Scene Planning
# =============================================================================

@router.post(
    "/v1/scripts/generate",
    response_model=ScriptGenerateResponse,
    dependencies=[Depends(verify_api_key), Depends(check_script_rate_limit)],
)
def generate_script_endpoint(payload: ScriptGenerateRequest):
    try:
        target_seconds = payload.resolve_target_duration_seconds()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    try:
        import src.main as main_mod
        gen_fn = getattr(main_mod, "generate_script", generate_script)
        result = gen_fn(
            prompt=payload.prompt,
            duration_seconds=target_seconds,
            tone=payload.tone,
            language=payload.language,
        )
    except ScriptWriterError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM generation failed: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Script generation failed: {exc}",
        ) from exc

    return ScriptGenerateResponse(
        script=result.script,
        word_count=result.word_count,
        estimated_seconds=result.estimated_seconds,
        target_words=result.target_words,
        script_source=result.script_source,
    )


@router.post(
    "/v1/scene-plans",
    response_model=ScenePlanResponse,
    dependencies=[Depends(verify_api_key), Depends(check_script_rate_limit)],
)
def create_scene_plan_endpoint(
    payload: ScenePlanRequest,
    request: Request,
    format: Optional[str] = Query("json"),
):
    if payload.audio_asset_id:
        from src.db.repository import AssetRepository
        rec = AssetRepository.get(payload.audio_asset_id)
        if rec and getattr(rec, "session_id", None):
            req_session = get_current_session_id(request)
            if rec.session_id != req_session:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: audio asset '{payload.audio_asset_id}' belongs to another session.",
                )

    from src.services.scene_planner import build_clip_scene_plan
    from src.services.llm import get_llm_provider

    try:
        response = build_clip_scene_plan(
            script=payload.script,
            style=payload.style or "cinematic",
            audio_asset_id=payload.audio_asset_id,
            target_duration_seconds=payload.target_duration_seconds,
            llm_provider=get_llm_provider(),
        )
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from exc
    except Exception as exc:
        logger.exception(f"Scene plan generation failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate scene plan.",
        ) from exc

    if format == "text" or request.headers.get("accept") == "text/plain":
        return PlainTextResponse(
            content=response.plain_text_prompts,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'inline; filename="{response.plan_id}.txt"',
            },
        )

    return response


# =============================================================================
# Assets
# =============================================================================

@router.post(
    "/v1/assets/upload",
    dependencies=[Depends(verify_api_key), Depends(check_upload_rate_limit)],
)
async def upload_asset_endpoint(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    if kind not in {"photo", "voice", "image", "audio", "music", "clip"}:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'photo', 'voice', 'image', 'audio', 'music', or 'clip'.",
        )

    import src.main as main_mod
    upload_fn = getattr(main_mod, "save_upload", save_upload)
    session_id = get_current_session_id(request)
    return upload_fn(file=file, kind=kind, session_id=session_id)


def _validate_safe_job_id(job_id: str) -> str:
    """Validate job identifier to prevent directory traversal or malformed injection."""
    if not job_id or not isinstance(job_id, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job identifier.",
        )
    if not re.match(r"^[a-zA-Z0-9_\-]{1,128}$", job_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid job identifier format: illegal characters or path traversal elements.",
        )
    return job_id


def _check_job_authorization(job: JobRecord, request: Request) -> None:
    """
    Enforce strict cross-visitor anonymous session isolation and IDOR protection.
    Refuses to trust client-supplied identity headers (X-Client-ID, X-User-ID) for session-owned jobs.
    """
    req_session = get_current_session_id(request)
    owner_session = getattr(job, "session_id", None)
    owner_client = getattr(job, "client_id", None)

    # 1. Enforce anonymous session ownership
    if owner_session:
        if req_session != owner_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: job belongs to another session.",
            )

    # 2. Multi-tenant client_id check (for tests/APIs using explicit client IDs)
    if owner_client:
        req_client = request.headers.get("X-Client-ID") or request.headers.get("X-User-ID")
        if not req_client or req_client.strip() != owner_client:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: job belongs to another client.",
            )


# =============================================================================
# Jobs
# =============================================================================

@router.post(
    "/v1/jobs/estimate",
    response_model=JobEstimateResponse,
    dependencies=[Depends(verify_api_key), Depends(check_script_rate_limit)],
)
def estimate_job_render(payload: JobEstimateRequest):
    mult = 2.7 if payload.visual_mode in ("picture_to_video", "talking_head") else 0.85
    est_s = round(payload.target_duration_seconds * mult, 1)
    mins = int(est_s // 60)
    secs = int(est_s % 60)
    human_str = f"{mins} min {secs} sec" if mins > 0 else f"{secs} sec"
    return JobEstimateResponse(
        target_duration_seconds=payload.target_duration_seconds,
        visual_mode=payload.visual_mode,
        estimated_render_seconds=est_s,
        estimated_render_human=human_str,
        compute_advisory=(
            f"{payload.visual_mode.capitalize()} mode estimated render duration is ~{mult}x video duration on CPU. "
            f"A {payload.target_duration_seconds:.0f}s video takes approximately {human_str}."
        ),
        retention_policy_hours=settings.job_retention_hours,
        voice_cloning_note=(
            "Cloud File.ai TTS synthesizes scripts using high-fidelity natural speech; "
            "uploaded voice samples are preserved as reference clips and are not cloned."
        ),
    )


@router.post(
    "/v1/jobs",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_api_key), Depends(check_job_creation_rate_limit)],
)
def create_video_job(payload: JobCreate, request: Request):
    import src.main as main_mod
    lock = getattr(main_mod, "JOB_CREATION_LOCK", JOB_CREATION_LOCK)
    active_fn = getattr(main_mod, "count_active_jobs", count_active_jobs)
    create_fn = getattr(main_mod, "create_job", create_job)
    save_fn = getattr(main_mod, "save_job_record", save_job_record)
    executor = getattr(main_mod, "JOB_EXECUTOR", None)
    if executor is None or getattr(executor, "_shutdown", False):
        executor = get_job_executor()
        main_mod.JOB_EXECUTOR = executor
    run_fn = getattr(main_mod, "run_job", run_job)

    with lock:
        active_count = active_fn()
        if active_count >= settings.max_active_jobs_cap:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Server busy: maximum capacity of {settings.max_active_jobs_cap} running or queued jobs reached. Please try again later.",
            )

        # Enforce asset ownership: prevent referencing assets uploaded by another anonymous session
        req_session = get_current_session_id(request)
        referenced_assets = []
        if getattr(payload, "photo_asset_id", None):
            referenced_assets.append(payload.photo_asset_id)
        if getattr(payload, "voice_asset_id", None):
            referenced_assets.append(payload.voice_asset_id)
        if getattr(payload, "music_asset_id", None):
            referenced_assets.append(payload.music_asset_id)
        if getattr(payload, "uploaded_audio_asset_id", None):
            referenced_assets.append(payload.uploaded_audio_asset_id)
        if getattr(payload, "uploaded_image_asset_ids", None):
            referenced_assets.extend(payload.uploaded_image_asset_ids)
        if getattr(payload, "clip_asset_ids", None):
            referenced_assets.extend(payload.clip_asset_ids)

        from src.db.repository import AssetRepository
        for aid in referenced_assets:
            rec = AssetRepository.get(aid)
            if rec and getattr(rec, "session_id", None):
                if rec.session_id != req_session:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Access denied: asset '{aid}' belongs to another session.",
                    )

        try:
            job = create_fn(payload)
            job.session_id = req_session
            client_id = request.headers.get("X-Client-ID") or request.headers.get("X-User-ID")
            if client_id:
                job.client_id = client_id.strip()
            save_fn(job)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    executor.submit(run_fn, job.job_id)
    return job


@router.get("/v1/jobs", dependencies=[Depends(verify_api_key)])
def list_jobs(request: Request):
    import src.main as main_mod
    list_fn = getattr(main_mod, "list_all_jobs", list_all_jobs)
    all_jobs = list_fn()
    req_session = get_current_session_id(request)
    req_client = request.headers.get("X-Client-ID") or request.headers.get("X-User-ID")

    if req_client:
        req_client_clean = req_client.strip()
        return [
            j for j in all_jobs
            if getattr(j, "client_id", None) in (None, req_client_clean)
            and getattr(j, "session_id", None) in (None, req_session)
        ]

    # When no explicit client header is provided:
    # 1. Any job owned by another session (j.session_id is not None and != req_session) is STRICTLY EXCLUDED.
    # 2. Jobs matching req_session are included.
    # 3. Legacy jobs (j.session_id is None) are included for backward compatibility in legacy test harnesses.
    return [
        j for j in all_jobs
        if (
            getattr(j, "session_id", None) == req_session
            or (getattr(j, "session_id", None) is None and getattr(j, "client_id", None) is None)
            or (getattr(j, "session_id", None) is None and not req_client)
        )
    ]


@router.get("/v1/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
def read_job(job_id: str, request: Request):
    job_id = _validate_safe_job_id(job_id)
    import src.main as main_mod
    get_fn = getattr(main_mod, "get_job", load_job_record)
    job = get_fn(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    _check_job_authorization(job, request)
    return job


@router.post("/v1/jobs/{job_id}/cancel", dependencies=[Depends(verify_api_key)])
def cancel_video_job(job_id: str, request: Request):
    job_id = _validate_safe_job_id(job_id)
    import src.main as main_mod
    get_fn = getattr(main_mod, "get_job", load_job_record)
    job = get_fn(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    _check_job_authorization(job, request)
    cancel_fn = getattr(main_mod, "cancel_job", cancel_job)
    return cancel_fn(job_id)


@router.get("/v1/jobs/{job_id}/download", dependencies=[Depends(verify_api_key)])
def download_job_video(job_id: str, request: Request):
    job_id = _validate_safe_job_id(job_id)
    import src.main as main_mod
    get_fn = getattr(main_mod, "get_job", load_job_record)
    job = get_fn(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    _check_job_authorization(job, request)

    if job.state != JobState.COMPLETED:
        raise HTTPException(status_code=409, detail="Job is not completed yet.")

    if not job.output_path:
        raise HTTPException(status_code=409, detail="Output file is missing.")

    path = Path(job.output_path).resolve()
    storage_root = settings.storage_dir.resolve()
    if not path.is_relative_to(storage_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: invalid file location.",
        )

    # Hardening: Prevent public exposure of sensitive files, database, session secrets, or non-video files
    allowed_dirs = [
        (storage_root / "outputs").resolve(),
        (storage_root / "jobs").resolve(),
        (storage_root / job_id).resolve(),
    ]
    if not any(path.is_relative_to(allowed_dir) for allowed_dir in allowed_dirs):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: sensitive or invalid file location.",
        )

    if path.name.startswith(".") or path.suffix.lower() not in {".mp4", ".mov", ".webm", ".mkv"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: invalid or non-video file type.",
        )

    if (
        hasattr(settings, "db_path") and path == settings.db_path.resolve()
        or hasattr(settings, "session_secret_file") and path == settings.session_secret_file.resolve()
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: access to sensitive server file is forbidden.",
        )

    if not path.exists():
        raise HTTPException(status_code=404, detail="Output file not found.")

    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "", job_id)
    safe_filename = f"{safe_name}.mp4"

    return FileResponse(
        path=str(path),
        media_type="video/mp4",
        filename=safe_filename,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
            "Content-Type": "video/mp4",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/v1/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
def delete_video_job(job_id: str, request: Request):
    job_id = _validate_safe_job_id(job_id)
    import src.main as main_mod
    get_fn = getattr(main_mod, "get_job", load_job_record)
    job = get_fn(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    _check_job_authorization(job, request)

    del_fn = getattr(main_mod, "delete_job_record", delete_job_record)
    try:
        success = del_fn(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not success:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {"ok": True, "deleted": True, "job_id": job_id}

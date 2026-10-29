import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    File,
    Form,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Security,
    UploadFile,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import APIKeyHeader

import time
from collections import defaultdict

from src.config import settings
from src.models.schemas import (
    JobCreate,
    JobEstimateRequest,
    JobEstimateResponse,
    JobState,
    ScriptGenerateRequest,
    ScriptGenerateResponse,
)
from src.services.jobs import count_active_jobs, create_job, get_job, list_all_jobs, recover_interrupted_jobs, run_job
from src.services.llm import LLMError
from src.services.script_writer import ScriptWriterError, generate_script
from src.services.store import save_upload
from src.utils.body_limit_middleware import RequestBodyLimitMiddleware
from src.utils.rate_limiter import (
    JOB_CREATION_LIMITER,
    SCRIPT_LIMITER,
    UPLOAD_LIMITER,
    get_client_ip,
)

_script_rate_limit_history = SCRIPT_LIMITER

import hmac
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

DISALLOWED_KEY_PLACEHOLDERS = {
    "your_secret_api_key_here",
    "change_me",
    "placeholder",
    "secret",
    "admin",
    "dev_key_123",
    "1234567890123456",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    key = (settings.api_key or "").strip()
    if not settings.allow_insecure_dev:
        if not key:
            raise RuntimeError(
                "CRITICAL SECURITY RISK: API_KEY is not configured and ALLOW_INSECURE_DEV is False. "
                "Application refused to start. Set API_KEY or set ALLOW_INSECURE_DEV=true for local dev."
            )
        if key.lower() in DISALLOWED_KEY_PLACEHOLDERS:
            raise RuntimeError(
                f"CRITICAL SECURITY RISK: API_KEY uses an insecure placeholder ('{key[:4]}...'). "
                "Application refused to start with insecure credentials. Set a strong random API key."
            )
        if len(key) < 16:
            raise RuntimeError(
                f"CRITICAL SECURITY RISK: API_KEY is too short ({len(key)} chars; minimum 16 required). "
                "Application refused to start. Set a longer API key or set ALLOW_INSECURE_DEV=true for local dev."
            )

    count = recover_interrupted_jobs()
    if count > 0:
        logger.info(f"Startup recovery: marked {count} interrupted jobs as FAILED.")

    try:
        from src.services.storage_retention import clean_expired_storage
        clean_expired_storage()
    except Exception as exc:
        logger.warning(f"Startup storage retention cleanup notice: {exc}")

    yield


docs_url = "/docs" if settings.allow_insecure_dev else None
redoc_url = "/redoc" if settings.allow_insecure_dev else None
openapi_url = "/openapi.json" if settings.allow_insecure_dev else None

app = FastAPI(
    title="Avatar Pipeline Backend",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)
app.add_middleware(RequestBodyLimitMiddleware)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if "Content-Security-Policy" not in response.headers:
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'"
        )
    return response


@app.exception_handler(RequestValidationError)
async def sanitized_validation_exception_handler(request: Request, exc: RequestValidationError):
    # Log field names and error types only; redact all user-supplied input values, scripts, PII
    field_errors = []
    for err in exc.errors():
        field_errors.append(f"{'.'.join(str(loc) for loc in err.get('loc', []))}: {err.get('type')}")
    logger.warning(f"Validation error on {request.method} {request.url.path}: {'; '.join(field_errors)}")

    sanitized_details = []
    for err in exc.errors():
        sanitized_details.append({
            "loc": err.get("loc"),
            "msg": err.get("msg"),
            "type": err.get("type"),
        })
    return JSONResponse(status_code=422, content={"detail": sanitized_details})

settings.storage_dir.mkdir(parents=True, exist_ok=True)
JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="JobWorker")
JOB_CREATION_LOCK = threading.Lock()


api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
) -> Optional[str]:
    if not settings.api_key:
        if settings.allow_insecure_dev:
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: API key is not configured on the server.",
        )

    if not header_key or not hmac.compare_digest(header_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    return header_key



@app.get("/health")
def health():
    return {"ok": True}


@app.get("/v1/capabilities", dependencies=[Depends(verify_api_key)])
def get_capabilities(
    mode: Optional[str] = Query(None),
    duration_seconds: Optional[float] = Query(None),
):
    from src.services.capabilities import get_system_capabilities
    return get_system_capabilities(mode=mode, duration_seconds=duration_seconds)


@app.get("/v1/durations")
def get_duration_options():
    from src.services.speech_to_text import is_whisper_available
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


@app.get("/v1/presets", dependencies=[Depends(verify_api_key)])
def get_presets():
    from src.services.presets import get_all_presets
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


@app.get("/v1/music-presets", dependencies=[Depends(verify_api_key)])
def list_music_presets():
    from src.services.music_presets import get_music_presets
    return get_music_presets()


@app.get("/v1/presets/avatars/{avatar_id}/thumbnail", dependencies=[Depends(verify_api_key)])
def get_avatar_thumbnail(avatar_id: str):
    from src.services.presets import get_avatar_file_path, is_valid_avatar_preset_id
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
@app.post(
    "/v1/scripts/generate",
    response_model=ScriptGenerateResponse,
    dependencies=[Depends(verify_api_key)],
)
def generate_script_endpoint(
    payload: ScriptGenerateRequest,
    request: Request,
):
    SCRIPT_LIMITER.check(get_client_ip(request))

    try:
        target_seconds = payload.resolve_target_duration_seconds()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    try:
        result = generate_script(
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


@app.post("/v1/assets/upload", dependencies=[Depends(verify_api_key)])
async def upload_asset(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    UPLOAD_LIMITER.check(get_client_ip(request))
    if kind not in {"photo", "voice", "image", "audio", "music"}:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'photo', 'voice', 'image', 'audio', or 'music'.",
        )

    return save_upload(file=file, kind=kind)


@app.post(
    "/v1/jobs/estimate",
    response_model=JobEstimateResponse,
    dependencies=[Depends(verify_api_key)],
)
def estimate_job_render(payload: JobEstimateRequest):
    mult = 2.7 if payload.visual_mode == "talking_head" else 0.85
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
            "Offline Piper TTS synthesizes typed scripts using built-in voices (Lessac); "
            "uploaded voice samples are used directly in 'My Own Audio' mode and are not cloned."
        ),
    )


@app.post("/v1/jobs", status_code=202, dependencies=[Depends(verify_api_key)])
def create_video_job(payload: JobCreate, request: Request):
    JOB_CREATION_LIMITER.check(get_client_ip(request))

    with JOB_CREATION_LOCK:
        active_count = count_active_jobs()
        if active_count >= settings.max_active_jobs_cap:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Server busy: maximum capacity of {settings.max_active_jobs_cap} running or queued jobs reached. Please try again later.",
            )

        try:
            job = create_job(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    JOB_EXECUTOR.submit(run_job, job.job_id)
    return job


@app.get("/v1/jobs", dependencies=[Depends(verify_api_key)])
def list_jobs():
    return list_all_jobs()


@app.get("/v1/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
def read_job(job_id: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    return job


@app.post("/v1/jobs/{job_id}/cancel", dependencies=[Depends(verify_api_key)])
def cancel_video_job(job_id: str):
    from src.services.jobs import cancel_job
    job = cancel_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/v1/jobs/{job_id}/download", dependencies=[Depends(verify_api_key)])
def download_job_video(job_id: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    if job.state != JobState.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="Job is not completed yet.",
        )

    if not job.output_path:
        raise HTTPException(
            status_code=409,
            detail="Output file is missing.",
        )

    path = Path(job.output_path).resolve()

    if not path.is_relative_to(settings.storage_dir.resolve()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: invalid file location.",
        )

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Output file not found.",
        )

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


@app.delete("/v1/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
def delete_video_job(job_id: str):
    from src.services.jobs import delete_job_record
    try:
        success = delete_job_record(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not success:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {"ok": True, "deleted": True, "job_id": job_id}
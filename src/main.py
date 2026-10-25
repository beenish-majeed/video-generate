import logging
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
    Security,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader, APIKeyQuery

import time
from collections import defaultdict

from src.config import settings
from src.models.schemas import (
    JobCreate,
    JobState,
    ScriptGenerateRequest,
    ScriptGenerateResponse,
)
from src.services.jobs import create_job, get_job, list_all_jobs, recover_interrupted_jobs, run_job
from src.services.llm import LLMError
from src.services.script_writer import ScriptWriterError, generate_script
from src.services.store import save_upload
from src.utils.body_limit_middleware import RequestBodyLimitMiddleware

from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.api_key and not settings.allow_insecure_dev:
        raise RuntimeError(
            "CRITICAL SECURITY RISK: API_KEY is not configured and ALLOW_INSECURE_DEV is False. "
            "Application refused to start. Set API_KEY or set ALLOW_INSECURE_DEV=true for local dev."
        )

    count = recover_interrupted_jobs()
    if count > 0:
        logger.info(f"Startup recovery: marked {count} interrupted jobs as FAILED.")
    yield


app = FastAPI(title="Avatar Pipeline Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware)

settings.storage_dir.mkdir(parents=True, exist_ok=True)
JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="JobWorker")


api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)


def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
    query_key: Optional[str] = Security(api_key_query),
) -> Optional[str]:
    if not settings.api_key:
        if settings.allow_insecure_dev:
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: API key is not configured on the server.",
        )

    token = header_key or query_key
    if token != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    return token



@app.get("/health")
def health():
    from src.services.speech_to_text import is_whisper_available
    return {
        "ok": True,
        "mock_mode": settings.mock_mode,
        "storage_dir": str(settings.storage_dir),
        "max_duration_policy_seconds": settings.max_duration_policy_seconds,
        "max_segment_seconds": settings.max_segment_seconds,
        "auto_subtitles_available": is_whisper_available(),
    }


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
SCRIPT_RATE_LIMIT_MAX_REQUESTS = 10
SCRIPT_RATE_LIMIT_WINDOW_SECONDS = 60.0
_script_rate_limit_history: dict[str, list[float]] = defaultdict(list)


def check_script_rate_limit(key: Optional[str] = None) -> None:
    client_id = key or "anonymous"
    now = time.time()
    history = _script_rate_limit_history[client_id]
    _script_rate_limit_history[client_id] = [t for t in history if now - t < SCRIPT_RATE_LIMIT_WINDOW_SECONDS]
    if len(_script_rate_limit_history[client_id]) >= SCRIPT_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: maximum 10 script generation requests per minute per key.",
        )
    _script_rate_limit_history[client_id].append(now)


@app.post(
    "/v1/scripts/generate",
    response_model=ScriptGenerateResponse,
    dependencies=[Depends(verify_api_key)],
)
def generate_script_endpoint(
    payload: ScriptGenerateRequest,
    api_key_token: Optional[str] = Depends(verify_api_key),
):
    check_script_rate_limit(api_key_token)

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
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    if kind not in {"photo", "voice", "image", "audio", "music"}:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'photo', 'voice', 'image', 'audio', or 'music'.",
        )

    return save_upload(file=file, kind=kind)


@app.post("/v1/jobs", status_code=202, dependencies=[Depends(verify_api_key)])
def create_video_job(payload: JobCreate):
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

    path = Path(job.output_path)

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Output file not found.",
        )

    return FileResponse(
        path=str(path),
        media_type="video/mp4",
        filename=f"{job_id}.mp4",
    )
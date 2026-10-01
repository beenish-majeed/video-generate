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

from src.config import settings
from src.models.schemas import JobCreate, JobState
from src.services.jobs import create_job, get_job, list_all_jobs, run_job
from src.services.store import save_upload

app = FastAPI(title="Avatar Pipeline Backend", version="0.1.0")

settings.storage_dir.mkdir(parents=True, exist_ok=True)
JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="JobWorker")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)


def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
    query_key: Optional[str] = Security(api_key_query),
) -> Optional[str]:
    if not settings.api_key:
        return None

    token = header_key or query_key
    if token != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    return token


@app.get("/health")
def health():
    return {
        "ok": True,
        "mock_mode": settings.mock_mode,
        "storage_dir": str(settings.storage_dir),
        "max_duration_policy_seconds": settings.max_duration_policy_seconds,
        "max_segment_seconds": settings.max_segment_seconds,
    }


@app.post("/v1/assets/upload", dependencies=[Depends(verify_api_key)])
async def upload_asset(
    kind: str = Form(...),
    file: UploadFile = File(...),
):
    if kind not in {"photo", "voice"}:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'photo' or 'voice'.",
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
from pathlib import Path

from fastapi import BackgroundTasks, File, Form, FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse

from src.config import settings
from src.models.schemas import JobCreate, JobState
from src.services.jobs import JOBS, create_job, get_job, run_job
from src.services.store import save_upload

app = FastAPI(title="Avatar Pipeline Backend", version="0.1.0")

settings.storage_dir.mkdir(parents=True, exist_ok=True)

@app.get("/health")
def health():
    return {
        "ok": True,
        "mock_mode": settings.mock_mode,
        "storage_dir": str(settings.storage_dir),
        "max_duration_policy_seconds": settings.max_duration_policy_seconds,
        "max_segment_seconds": settings.max_segment_seconds,
    }

@app.post("/v1/assets/upload")
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


@app.post("/v1/jobs", status_code=202)
def create_video_job(
    payload: JobCreate,
    background_tasks: BackgroundTasks,
):
    try:
        job = create_job(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(run_job, job.job_id)

    return job


@app.get("/v1/jobs")
def list_jobs():
    return list(JOBS.values())


@app.get("/v1/jobs/{job_id}")
def read_job(job_id: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    return job


@app.get("/v1/jobs/{job_id}/download")
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
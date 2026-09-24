import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile

from src.config import settings
from src.utils.hash import sha256_file

ASSETS_DIR = settings.storage_dir / "assets"
JOBS_DIR = settings.storage_dir / "jobs"

ASSETS_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)


def save_upload(file: UploadFile, kind: str) -> dict:
    asset_id = f"{kind}_{uuid.uuid4().hex[:12]}"
    ext = Path(file.filename or "").suffix or ".bin"
    path = ASSETS_DIR / f"{asset_id}{ext}"

    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "asset_id": asset_id,
        "kind": kind,
        "path": str(path),
        "sha256": sha256_file(path),
    }


def get_asset_path(asset_id: str) -> Path | None:
    for p in ASSETS_DIR.iterdir():
        if p.stem.startswith(asset_id):
            return p
    return None


def job_dir(job_id: str) -> Path:
    path = JOBS_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path
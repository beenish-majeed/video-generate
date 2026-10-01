import shutil
import uuid
from pathlib import Path
from fastapi import HTTPException, UploadFile
from PIL import Image

from src.config import settings
from src.utils.hash import sha256_file

ASSETS_DIR = settings.storage_dir / "assets"
JOBS_DIR = settings.storage_dir / "jobs"

ASSETS_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024  # 20MB
MAX_VOICE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB

ALLOWED_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_VOICE_EXTS = {".wav", ".mp3", ".ogg", ".flac", ".m4a"}


def validate_upload(file: UploadFile, kind: str) -> None:
    ext = Path(file.filename or "").suffix.lower()

    if kind == "photo":
        if ext not in ALLOWED_PHOTO_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid photo extension '{ext}'. Allowed: {sorted(ALLOWED_PHOTO_EXTS)}",
            )
        
        # Read file header and check size limit
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

        if size > MAX_PHOTO_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Photo file size ({size} bytes) exceeds limit ({MAX_PHOTO_SIZE_BYTES} bytes).",
            )
        
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded photo file is empty.")

        # Verify image can be decoded
        try:
            img = Image.open(file.file)
            img.verify()
            file.file.seek(0)
        except Exception as exc:
            file.file.seek(0)
            raise HTTPException(
                status_code=400, detail=f"Invalid image file format or corrupt image: {exc}"
            ) from exc

    elif kind == "voice":
        if ext not in ALLOWED_VOICE_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid voice extension '{ext}'. Allowed: {sorted(ALLOWED_VOICE_EXTS)}",
            )

        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

        if size > MAX_VOICE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Voice file size ({size} bytes) exceeds limit ({MAX_VOICE_SIZE_BYTES} bytes).",
            )

        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded voice file is empty.")


def save_upload(file: UploadFile, kind: str) -> dict:
    validate_upload(file, kind)

    asset_id = f"{kind}_{uuid.uuid4().hex[:12]}"
    ext = Path(file.filename or "").suffix.lower() or ".bin"
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
    if not asset_id or not isinstance(asset_id, str):
        return None

    # Sanitize asset_id to prevent path traversal
    clean_id = Path(asset_id).name.strip()
    if not clean_id:
        return None

    # Strict exact stem match (p.stem == clean_id)
    for p in ASSETS_DIR.iterdir():
        if p.is_file() and p.stem == clean_id:
            return p
    return None


def job_dir(job_id: str) -> Path:
    path = JOBS_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path
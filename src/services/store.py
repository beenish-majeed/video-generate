import shutil
import uuid
from pathlib import Path
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps

from src.config import settings

# Enforce strict pixel cap on Pillow to protect against decompression bombs
Image.MAX_IMAGE_PIXELS = settings.max_image_pixels
from src.utils.hash import sha256_file

ASSETS_DIR = settings.storage_dir / "assets"
JOBS_DIR = settings.storage_dir / "jobs"

ASSETS_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024  # 20MB
MAX_VOICE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB
MAX_MUSIC_SIZE_BYTES = 30 * 1024 * 1024  # 30MB

ALLOWED_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_VOICE_EXTS = {".wav", ".mp3", ".ogg", ".flac", ".m4a"}
ALLOWED_MUSIC_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}

MIN_MUSIC_DURATION_SECONDS = 5.0
MAX_MUSIC_DURATION_SECONDS = 1200.0  # 20 minutes


def _verify_audio_and_get_duration(file: UploadFile, ext: str) -> float:
    """
    Decodes audio content and returns its duration in seconds.
    Raises ValueError or Exception if audio is corrupt, empty, or cannot be decoded.
    """
    # 1. Try wave module for WAV files
    if ext in {".wav", ".wave"}:
        try:
            import wave
            with wave.open(file.file, "rb") as wf:
                channels = wf.getnchannels()
                rate = wf.getframerate()
                frames = wf.getnframes()
                if channels > 0 and rate > 0 and frames > 0:
                    return float(frames / rate)
        except Exception:
            pass
        finally:
            file.file.seek(0)

    # 2. Try soundfile (handles WAV, MP3, OGG, FLAC in-memory)
    try:
        import soundfile as sf
        info = sf.info(file.file)
        if info.duration > 0 and info.channels > 0:
            return float(info.duration)
    except Exception:
        pass
    finally:
        file.file.seek(0)

    # 3. For formats soundfile doesn't support directly (e.g. .m4a / AAC) or fallback:
    # Use temporary file with ffprobe and ffmpeg decode check
    import tempfile
    from src.utils.subprocess_runner import run_subprocess
    import json
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp_path = Path(tmp.name)
            shutil.copyfileobj(file.file, tmp)
        file.file.seek(0)

        probe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_type:format=duration",
            "-of", "json",
            str(tmp_path),
        ]
        probe_res = run_subprocess(probe_cmd)
        if probe_res.returncode == 0:
            data = json.loads(probe_res.stdout)
            streams = data.get("streams", [])
            dur_str = data.get("format", {}).get("duration")
            if streams and streams[0].get("codec_type") == "audio" and dur_str:
                # Real decode check to catch mid-file corruption or truncated headers
                decode_cmd = [
                    settings.ffmpeg_bin,
                    "-v", "error",
                    "-i", str(tmp_path),
                    "-f", "null",
                    "-",
                ]
                decode_res = run_subprocess(decode_cmd)
                if decode_res.returncode == 0:
                    dur = float(dur_str)
                    if dur > 0:
                        return dur
    except Exception:
        pass
    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass
        file.file.seek(0)

    raise ValueError("Could not decode audio header or file contains corrupt audio data.")


def validate_upload(file: UploadFile, kind: str) -> None:
    ext = Path(file.filename or "").suffix.lower()

    if kind in {"photo", "image"}:
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

        # Verify image dimensions and structural integrity BEFORE any full decode
        try:
            with Image.open(file.file) as img:
                # Reject animated or multi-frame formats (APNG, animated WebP, animated GIF)
                if getattr(img, "is_animated", False) or getattr(img, "n_frames", 1) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Animated or multi-frame images are not supported.",
                    )

                fmt = (img.format or "").upper()
                allowed_formats = {"JPEG", "PNG", "WEBP"}
                if fmt not in allowed_formats:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Disallowed underlying image format '{img.format}'. Allowed: JPEG, PNG, WebP.",
                    )

                ext_map = {
                    ".jpg": "JPEG",
                    ".jpeg": "JPEG",
                    ".png": "PNG",
                    ".webp": "WEBP",
                }
                expected_format = ext_map.get(ext)
                if expected_format and fmt != expected_format:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image extension '{ext}' does not match real image codec '{fmt}'.",
                    )

                w, h = img.size
                if w <= 0 or h <= 0:
                    raise HTTPException(status_code=400, detail="Invalid image dimensions.")

                pixels = w * h
                if w > settings.max_image_width or h > settings.max_image_height or pixels > settings.max_image_pixels:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image dimensions ({w}x{h}, {pixels} pixels) exceed allowed limit "
                               f"({settings.max_image_width}x{settings.max_image_height}, {settings.max_image_pixels} pixels).",
                    )
                img.verify()
        except HTTPException:
            file.file.seek(0)
            raise
        except Image.DecompressionBombError as exc:
            file.file.seek(0)
            raise HTTPException(
                status_code=400,
                detail=f"Image exceeds allowed limit: {exc}",
            ) from exc
        except Exception as exc:
            file.file.seek(0)
            raise HTTPException(
                status_code=400, detail=f"Invalid image file format or corrupt image: {exc}"
            ) from exc
        finally:
            file.file.seek(0)

    elif kind in {"voice", "audio"}:
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

        # Verify real audio content structure and duration
        try:
            duration = _verify_audio_and_get_duration(file, ext)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio file format or corrupt audio: {exc}",
            ) from exc

        if duration < settings.min_duration_seconds:
            raise HTTPException(
                status_code=400,
                detail=f"Audio duration ({duration:.2f}s) is below minimum allowed ({settings.min_duration_seconds}s).",
            )

        if duration > settings.max_voice_duration_seconds:
            raise HTTPException(
                status_code=400,
                detail=f"Audio duration ({duration:.2f}s) exceeds maximum allowed ({settings.max_voice_duration_seconds}s).",
            )

    elif kind == "music":
        if ext not in ALLOWED_MUSIC_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid music extension '{ext}'. Allowed: {sorted(ALLOWED_MUSIC_EXTS)}",
            )

        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

        if size > MAX_MUSIC_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Music file size ({size} bytes) exceeds limit ({MAX_MUSIC_SIZE_BYTES} bytes).",
            )

        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded music file is empty.")

        try:
            duration = _verify_audio_and_get_duration(file, ext)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio file format or corrupt audio: {exc}",
            ) from exc

        if duration < MIN_MUSIC_DURATION_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Music duration ({duration:.2f}s) is below minimum of {MIN_MUSIC_DURATION_SECONDS} seconds.",
            )

        if duration > MAX_MUSIC_DURATION_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Music duration ({duration:.2f}s) exceeds maximum of {int(MAX_MUSIC_DURATION_SECONDS / 60)} minutes.",
            )


def save_upload(file: UploadFile, kind: str) -> dict:
    validate_upload(file, kind)

    asset_id = f"{kind}_{uuid.uuid4().hex}"
    ext = Path(file.filename or "").suffix.lower() or ".bin"
    path = ASSETS_DIR / f"{asset_id}{ext}"

    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Fix EXIF rotation for images
    if kind in {"photo", "image"}:
        try:
            with Image.open(path) as img:
                w, h = img.size
                if w <= settings.max_image_width and h <= settings.max_image_height and (w * h) <= settings.max_image_pixels:
                    transposed = ImageOps.exif_transpose(img)
                    if transposed is not None:
                        transposed.save(path)
        except Exception:
            pass

    ret = {
        "asset_id": asset_id,
        "kind": kind,
        "path": str(path),
        "sha256": sha256_file(path),
    }

    if kind in {"photo", "image"}:
        try:
            from src.services.face_detector import count_faces_in_image
            ret["faces_detected"] = count_faces_in_image(path)
        except Exception:
            ret["faces_detected"] = 0

    if kind in {"voice", "audio", "music"}:
        try:
            from src.utils.ffmpeg import probe_duration
            ret["duration_seconds"] = round(probe_duration(path), 2)
        except Exception:
            pass

    return ret


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
    from src.models.schemas import is_valid_job_id
    if not is_valid_job_id(job_id):
        raise ValueError(f"Invalid job_id: '{job_id}'")
    safe_name = Path(job_id).name
    path = (JOBS_DIR / safe_name).resolve()
    if not path.is_relative_to(JOBS_DIR.resolve()):
        raise ValueError(f"Path traversal detected in job_id: '{job_id}'")
    path.mkdir(parents=True, exist_ok=True)
    return path
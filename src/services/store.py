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
ALLOWED_CLIP_EXTS = {".mp4", ".mov", ".webm", ".mkv"}
ALLOWED_CLIP_CODECS = {"h264", "hevc", "h265", "vp9", "av1"}

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

    if kind == "clip":
        if ext not in ALLOWED_CLIP_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid clip extension '{ext}'. Allowed: {sorted(ALLOWED_CLIP_EXTS)}",
            )

        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)

        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded clip file is empty.")

        if size > settings.max_clip_size_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"Clip file size ({size} bytes) exceeds limit ({settings.max_clip_size_bytes} bytes).",
            )

        import json
        import tempfile
        from src.utils.subprocess_runner import run_subprocess

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp_path = Path(tmp.name)
                shutil.copyfileobj(file.file, tmp)
            file.file.seek(0)

            probe_cmd = [
                settings.ffprobe_bin,
                "-v", "error",
                "-protocol_whitelist", "file",
                "-show_entries", "stream=index,codec_name,codec_type,width,height,r_frame_rate,duration:format=duration",
                "-of", "json",
                str(tmp_path),
            ]
            probe_res = run_subprocess(probe_cmd, timeout=settings.subprocess_ffprobe_timeout_seconds)
            if probe_res.returncode != 0:
                raise HTTPException(status_code=400, detail="Could not read video clip metadata or file is corrupt.")

            data = json.loads(probe_res.stdout)
            streams = data.get("streams", [])
            video_streams = [s for s in streams if s.get("codec_type") == "video"]
            if len(video_streams) != 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded clip must contain exactly one video stream (found {len(video_streams)}).",
                )

            v_stream = video_streams[0]
            codec = (v_stream.get("codec_name") or "").lower()
            if codec not in ALLOWED_CLIP_CODECS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported video codec '{codec}'. Allowed codecs: {sorted(ALLOWED_CLIP_CODECS)}",
                )

            dur_str = data.get("format", {}).get("duration") or v_stream.get("duration")
            try:
                dur = float(dur_str)
            except (TypeError, ValueError):
                dur = 0.0

            if dur <= 0.0:
                raise HTTPException(status_code=400, detail="Uploaded clip duration is zero or could not be determined.")

            if dur > settings.max_clip_duration_seconds:
                raise HTTPException(
                    status_code=400,
                    detail=f"Clip duration ({dur:.2f}s) exceeds maximum allowed {settings.max_clip_duration_seconds} seconds.",
                )

            width = int(v_stream.get("width") or 0)
            height = int(v_stream.get("height") or 0)
            if width <= 0 or height <= 0:
                raise HTTPException(status_code=400, detail="Invalid video dimensions in clip.")

            if width > settings.max_clip_width or height > settings.max_clip_height:
                raise HTTPException(
                    status_code=400,
                    detail=f"Clip resolution ({width}x{height}) exceeds maximum allowed {settings.max_clip_width}x{settings.max_clip_height}.",
                )

            fps_str = v_stream.get("r_frame_rate", "30/1")
            try:
                if "/" in str(fps_str):
                    num, den = str(fps_str).split("/")
                    fps = float(num) / float(den) if float(den) > 0 else 30.0
                else:
                    fps = float(fps_str)
            except Exception:
                fps = 30.0

            if fps > settings.max_clip_fps:
                raise HTTPException(
                    status_code=400,
                    detail=f"Clip frame rate ({fps:.1f} fps) exceeds maximum allowed {settings.max_clip_fps} fps.",
                )

            # First second decode check
            d1_cmd = [
                settings.ffmpeg_bin,
                "-v", "error",
                "-protocol_whitelist", "file",
                "-ss", "0",
                "-t", "1",
                "-i", str(tmp_path),
                "-f", "null",
                "-",
            ]
            d1_res = run_subprocess(d1_cmd, timeout=settings.subprocess_ffprobe_timeout_seconds)
            if d1_res.returncode != 0:
                raise HTTPException(status_code=400, detail="Corrupt video stream detected at beginning of clip.")

            # Last second decode check if duration > 1.0s
            if dur > 1.0:
                d2_cmd = [
                    settings.ffmpeg_bin,
                    "-v", "error",
                    "-protocol_whitelist", "file",
                    "-sseof", "-1",
                    "-i", str(tmp_path),
                    "-f", "null",
                    "-",
                ]
                d2_res = run_subprocess(d2_cmd, timeout=settings.subprocess_ffprobe_timeout_seconds)
                if d2_res.returncode != 0:
                    raise HTTPException(status_code=400, detail="Corrupt video stream detected at end of clip.")

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to validate video clip: {exc}") from exc
        finally:
            if tmp_path and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            file.file.seek(0)


def save_upload(file: UploadFile, kind: str) -> dict:
    validate_upload(file, kind)

    asset_id = f"{kind}_{uuid.uuid4().hex}"
    ext = Path(file.filename or "").suffix.lower() or ".bin"
    path = ASSETS_DIR / f"{asset_id}{ext}"

    if kind == "clip":
        # Save to temp file first, then sanitize and re-encode
        import tempfile
        from src.utils.subprocess_runner import run_subprocess
        import json
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp_up:
            tmp_up_path = Path(tmp_up.name)
            shutil.copyfileobj(file.file, tmp_up)

        strip_cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-protocol_whitelist", "file",
            "-i", str(tmp_up_path),
            "-map", "0:v:0",
            "-an",
            "-sn",
            "-dn",
            "-map_metadata", "-1",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            str(path),
        ]
        try:
            res = run_subprocess(strip_cmd, timeout=settings.subprocess_default_timeout_seconds)
            if res.returncode != 0 or not path.exists():
                raise HTTPException(status_code=400, detail="Failed to sanitize and re-encode video clip.")
        finally:
            if tmp_up_path.exists():
                tmp_up_path.unlink(missing_ok=True)
    else:
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
            import cv2
            img_bgr = cv2.imread(str(path))
            if img_bgr is not None:
                gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
                face_cascade = cv2.CascadeClassifier(cascade_path)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                ret["faces_detected"] = len(faces)
            else:
                ret["faces_detected"] = 1
        except Exception:
            ret["faces_detected"] = 1

    if kind in {"voice", "audio", "music"}:
        try:
            from src.utils.ffmpeg import probe_duration
            ret["duration_seconds"] = round(probe_duration(path), 2)
        except Exception:
            pass

    if kind == "clip":
        import json
        from src.utils.subprocess_runner import run_subprocess
        probe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate,duration:format=duration",
            "-of", "json",
            str(path),
        ]
        try:
            pres = run_subprocess(probe_cmd)
            pdata = json.loads(pres.stdout)
            vst = pdata.get("streams", [{}])[0]
            ret["codec"] = vst.get("codec_name")
            ret["width"] = int(vst.get("width") or 0)
            ret["height"] = int(vst.get("height") or 0)
            dur_val = pdata.get("format", {}).get("duration") or vst.get("duration")
            ret["duration_seconds"] = round(float(dur_val), 2) if dur_val else 0.0
            r_fps = vst.get("r_frame_rate", "30/1")
            if "/" in str(r_fps):
                n, d = str(r_fps).split("/")
                ret["fps"] = round(float(n) / float(d), 2) if float(d) > 0 else 30.0
            else:
                ret["fps"] = round(float(r_fps), 2)
        except Exception:
            pass

    try:
        from src.db.repository import AssetRepository
        file_size = path.stat().st_size if path.exists() else 0
        AssetRepository.save(
            asset_id=asset_id,
            kind=kind,
            filename=file.filename,
            path=str(path),
            size_bytes=file_size,
            sha256=ret.get("sha256", ""),
            duration_seconds=ret.get("duration_seconds"),
        )
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
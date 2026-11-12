import io
import json
import logging
import re
from pathlib import Path
from typing import Optional, Union

import numpy as np
from PIL import Image

from src.core.config import settings
from src.utils.ffmpeg import probe_duration
from src.utils.subprocess_runner import run_subprocess

logger = logging.getLogger(__name__)


def check_segment(
    video_path: Union[str, Path],
    expected_duration: float,
    tolerance: Optional[float] = None,
) -> dict:
    if tolerance is None:
        tolerance = expected_duration * 0.10

    try:
        actual = probe_duration(video_path)
    except Exception as exc:
        return {
            "passed": False,
            "error": str(exc),
            "expected_duration": expected_duration,
            "actual_duration": None,
            "diff": None,
        }

    diff = abs(actual - expected_duration)
    passed = diff <= tolerance

    return {
        "passed": passed,
        "expected_duration": expected_duration,
        "actual_duration": actual,
        "diff": diff,
    }


def check_audio_stream_present(video_path: Union[str, Path]) -> tuple[bool, str]:
    """Verify that an audio stream exists in the video container."""
    p = Path(video_path)
    if not p.exists():
        return False, f"File not found: {video_path}"

    cmd = [
        settings.ffprobe_bin,
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type,channels,sample_rate",
        "-of",
        "json",
        str(p),
    ]
    try:
        res = run_subprocess(cmd)
        if res.returncode != 0:
            return False, f"ffprobe error: {res.stderr.strip()[:200]}"
        data = json.loads(res.stdout)
        streams = data.get("streams", [])
        if not streams:
            return False, "No audio stream found in container"
        return True, "Audio stream present"
    except Exception as exc:
        return False, f"ffprobe execution failed: {exc}"


def check_audio_mean_volume(
    video_path: Union[str, Path],
    min_mean_volume_db: float = -50.0,
) -> tuple[bool, Optional[float], str]:
    """
    Measure mean audio volume using FFmpeg volumedetect filter.
    Returns (passed, mean_volume_db, description).
    """
    p = Path(video_path)
    if not p.exists():
        return False, None, f"File not found: {video_path}"

    cmd = [
        settings.ffmpeg_bin,
        "-nostdin",
        "-i",
        str(p),
        "-af",
        "volumedetect",
        "-vn",
        "-sn",
        "-dn",
        "-f",
        "null",
        "-",
    ]
    try:
        res = run_subprocess(cmd)
        m = re.search(r"mean_volume:\s*([-\d\.]+)\s*dB", res.stderr)
        if not m:
            if "mean_volume: -inf dB" in res.stderr:
                return False, -float("inf"), "Audio is completely silent (-inf dB)"
            return False, None, "volumedetect could not parse mean_volume"

        mean_vol = float(m.group(1))
        passed = mean_vol > min_mean_volume_db
        msg = f"Mean volume: {mean_vol:.1f} dB (required > {min_mean_volume_db:.1f} dB)"
        return passed, mean_vol, msg
    except Exception as exc:
        return False, None, f"volumedetect execution failed: {exc}"


def extract_video_frame(video_path: Union[str, Path], timestamp_s: float) -> Optional[np.ndarray]:
    """Extract a single frame at timestamp_s as an RGB numpy array."""
    p = Path(video_path)
    if not p.exists():
        return None

    cmd = [
        settings.ffmpeg_bin,
        "-nostdin",
        "-ss",
        f"{max(0.0, timestamp_s):.3f}",
        "-i",
        str(p),
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "ppm",
        "-",
    ]
    try:
        res = run_subprocess(cmd)
        if res.returncode != 0 or not res.stdout:
            return None
        with Image.open(io.BytesIO(res.stdout)) as img:
            return np.array(img.convert("RGB"), dtype=np.float32)
    except Exception as exc:
        logger.warning(f"Failed to extract frame at {timestamp_s:.2f}s: {exc}")
        return None


def check_video_not_static(
    video_path: Union[str, Path],
    actual_duration: float,
    min_mae: float = 1.0,
) -> tuple[bool, Optional[float], str]:
    """
    Verify video is not a static still image by sampling frames at 2s and 8s
    (or scaled for shorter videos) and computing Mean Absolute Error.
    """
    p = Path(video_path)
    if not p.exists():
        return False, None, f"File not found: {video_path}"

    if actual_duration >= 8.5:
        t1, t2 = 2.0, 8.0
    elif actual_duration >= 3.0:
        t1 = 1.0
        t2 = min(actual_duration - 0.5, 2.5)
    else:
        t1 = max(0.1, actual_duration * 0.2)
        t2 = min(actual_duration - 0.1, actual_duration * 0.8)

    f1 = extract_video_frame(p, t1)
    f2 = extract_video_frame(p, t2)

    if f1 is None or f2 is None:
        return False, None, "Could not extract sampled video frames"

    # Ensure shape match
    if f1.shape != f2.shape:
        return True, 999.0, f"Frame dimensions change ({f1.shape} vs {f2.shape})"

    mae = float(np.mean(np.abs(f1 - f2)))
    passed = mae >= min_mae
    msg = f"Frame diff between {t1:.1f}s and {t2:.1f}s: MAE {mae:.2f} (required >= {min_mae:.1f})"
    return passed, mae, msg


def check_final(
    video_path: Union[str, Path],
    expected_duration: float,
    tolerance: Optional[float] = None,
    check_audio: bool = True,
    check_motion: bool = True,
    min_mean_volume_db: float = -50.0,
) -> dict:
    """
    Comprehensive automatic acceptance check for generated video:
    1. Duration within tolerance (defaults to 10% of target)
    2. Audio stream present
    3. Mean audio volume > -50 dB
    4. Video not static between sampled frames (e.g. 2s and 8s)
    """
    base_res = check_segment(video_path, expected_duration, tolerance)
    diff = base_res.get("diff", 0.0)
    actual_duration = base_res.get("actual_duration")

    errors: list[str] = []
    if not base_res["passed"]:
        if base_res.get("error"):
            errors.append(f"Duration probe error: {base_res['error']}")
        else:
            errors.append(
                f"Duration mismatch: actual {actual_duration:.2f}s vs expected {expected_duration:.2f}s "
                f"(diff: {diff:.2f}s > tolerance: {tolerance or expected_duration*0.1:.2f}s)"
            )

    p = Path(video_path)
    # If file doesn't exist on disk (e.g. mock unit tests), return base duration result
    if not p.exists():
        return {
            "passed": base_res["passed"],
            "expected_duration": expected_duration,
            "actual_duration": actual_duration,
            "diff": diff,
            "errors": errors,
        }

    audio_stream_ok = True
    mean_volume_db = None
    volume_ok = True
    if check_audio:
        audio_stream_ok, a_msg = check_audio_stream_present(p)
        if not audio_stream_ok:
            errors.append(a_msg)
        else:
            volume_ok, mean_volume_db, v_msg = check_audio_mean_volume(p, min_mean_volume_db)
            if not volume_ok:
                errors.append(v_msg)

    motion_ok = True
    frame_diff_mae = None
    if check_motion and actual_duration and actual_duration > 0.5:
        motion_ok, frame_diff_mae, m_msg = check_video_not_static(p, actual_duration)
        if not motion_ok:
            errors.append(m_msg)

    all_passed = bool(base_res["passed"] and audio_stream_ok and volume_ok and motion_ok)

    return {
        "passed": all_passed,
        "expected_duration": expected_duration,
        "actual_duration": actual_duration,
        "diff": diff,
        "audio_stream_present": audio_stream_ok,
        "mean_volume_db": mean_volume_db,
        "frame_difference_mae": frame_diff_mae,
        "errors": errors,
    }

from pathlib import Path

from src.utils.ffmpeg import probe_duration


def check_segment(
    video_path: str | Path,
    expected_duration: float,
    tolerance: float = 1.0,
) -> dict:
    try:
        actual = probe_duration(video_path)
    except Exception as exc:
        return {
            "passed": False,
            "error": str(exc),
            "expected_duration": expected_duration,
            "actual_duration": None,
        }

    passed = abs(actual - expected_duration) <= max(tolerance, expected_duration * 0.25)

    return {
        "passed": passed,
        "expected_duration": expected_duration,
        "actual_duration": actual,
        "diff": abs(actual - expected_duration),
    }


def check_final(
    video_path: str | Path,
    expected_duration: float,
    tolerance: float = 2.0,
) -> dict:
    return check_segment(video_path, expected_duration, tolerance)
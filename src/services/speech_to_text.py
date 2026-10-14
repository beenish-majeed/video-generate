import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_WHISPER_MODEL_DIR = Path("models/whisper/tiny")


def is_whisper_available(model_dir: Optional[Path] = None) -> bool:
    """
    Check if faster-whisper is installed and local offline weights exist.
    Returns False gracefully if library or model is not installed.
    """
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False

    target = model_dir or DEFAULT_WHISPER_MODEL_DIR
    # Model can be loaded either from a local directory or cached model name
    return target.exists() or Path("models/whisper").exists()


def _format_vtt_timestamp(seconds: float) -> str:
    """Format seconds into WebVTT timestamp: HH:MM:SS.mmm"""
    sec = max(0.0, float(seconds))
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def transcribe_audio_to_webvtt(
    audio_path: Path,
    output_vtt_path: Path,
    model_dir: Optional[Path] = None,
) -> Optional[Path]:
    """
    Transcribe audio file into WebVTT format using faster-whisper.
    If faster-whisper is not installed or available, returns None without raising an error.
    """
    if not is_whisper_available(model_dir):
        logger.info("faster-whisper is not installed or model weights are missing. Skipping auto-subtitles.")
        return None

    try:
        from faster_whisper import WhisperModel

        target = str(model_dir or DEFAULT_WHISPER_MODEL_DIR)
        model = WhisperModel(target, device="cpu", compute_type="int8")

        segments, _ = model.transcribe(str(audio_path), beam_size=1)

        output_vtt_path.parent.mkdir(parents=True, exist_ok=True)
        lines = ["WEBVTT", ""]

        cue_idx = 1
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            start_str = _format_vtt_timestamp(seg.start)
            end_str = _format_vtt_timestamp(seg.end)
            lines.append(str(cue_idx))
            lines.append(f"{start_str} --> {end_str}")
            lines.append(text)
            lines.append("")
            cue_idx += 1

        output_vtt_path.write_text("\n".join(lines), encoding="utf-8")
        return output_vtt_path
    except Exception as exc:
        logger.warning(f"Error during audio transcription: {exc}")
        return None

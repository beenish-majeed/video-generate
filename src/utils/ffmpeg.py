import json
import math
import struct
import subprocess
import wave
from pathlib import Path

from src.config import settings


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def probe_duration(path: str | Path) -> float:
    path = str(path)
    cmd = [
        settings.ffprobe_bin,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
    ]
    proc = run(cmd)
    data = json.loads(proc.stdout)
    return float(data["format"]["duration"])


def make_silence_wav(
    path: str | Path,
    seconds: float,
    sample_rate: int | None = None,
) -> None:
    sample_rate = sample_rate or settings.sample_rate
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    seconds = max(0.01, float(seconds))
    n_frames = max(1, int(round(seconds * sample_rate)))

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)

        chunk_frames = min(240000, n_frames)
        chunk = b"\x00\x00" * chunk_frames

        remaining = n_frames

        while remaining > 0:
            write_frames = min(chunk_frames, remaining)

            if write_frames == chunk_frames:
                wf.writeframes(chunk)
            else:
                wf.writeframes(chunk[: write_frames * 2])

            remaining -= write_frames


def make_tone_wav(
    path: str | Path,
    seconds: float,
    freq: float = 220.0,
    sample_rate: int | None = None,
    volume: float = 0.03,
) -> None:
    sample_rate = sample_rate or settings.sample_rate
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    seconds = max(0.01, float(seconds))
    n_frames = max(1, int(round(seconds * sample_rate)))

    freq = max(1.0, float(freq))
    volume = max(0.0, min(1.0, float(volume)))

    cycle_len = max(2, int(sample_rate / freq))

    cycle = b"".join(
        struct.pack(
            "<h",
            int(32767 * volume * math.sin(2 * math.pi * freq * i / sample_rate)),
        )
        for i in range(cycle_len)
    )

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)

        chunk_frames = min(240000, max(cycle_len, n_frames))
        remaining = n_frames

        while remaining > 0:
            write_frames = min(chunk_frames, remaining)
            repeats = write_frames // cycle_len + 1
            data = (cycle * repeats)[: write_frames * 2]
            wf.writeframes(data)
            remaining -= write_frames


def concat_wavs(paths: list[str], out_path: str | Path) -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not paths:
        make_silence_wav(out_path, 0.1)
        return

    with wave.open(paths[0], "rb") as first:
        params = first.getparams()

    with wave.open(str(out_path), "wb") as out:
        out.setparams(params)
        for p in paths:
            with wave.open(p, "rb") as w:
                out.writeframes(w.readframes(w.getnframes()))


def normalize_audio_duration(
    input_path: str | Path,
    output_path: str | Path,
    target_seconds: float,
    sample_rate: int | None = None,
) -> None:
    sample_rate = sample_rate or settings.sample_rate
    input_path = Path(input_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_path = output_path.with_name(output_path.stem + ".tmp.wav")

    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-i",
        str(input_path),
        "-af",
        "apad",
        "-t",
        f"{float(target_seconds):.3f}",
        "-ar",
        str(sample_rate),
        "-ac",
        "1",
        str(tmp_path),
    ]

    run(cmd)
    tmp_path.replace(output_path)


def create_placeholder_video(
    path: str | Path,
    duration: float,
    resolution: str,
    fps: int,
    color: str = "0x102030",
) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    duration = max(0.04, float(duration))

    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c={color}:s={resolution}:r={fps}",
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
        str(path),
    ]

    run(cmd)


def concat_videos(paths: list[str], output_path: str | Path) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    list_path = output_path.with_suffix(".txt")

    with open(list_path, "w", encoding="utf-8") as f:
        for p in paths:
            abs_path = Path(p).resolve()
            f.write(f"file '{abs_path}'\n")

    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
        "-c",
        "copy",
        str(output_path),
    ]

    run(cmd)


def finalize_video(
    video_path: str | Path,
    audio_path: str | Path,
    watermark_path: str | Path | None,
    output_path: str | Path,
    duration: float,
    subtitle_path: str | Path | None = None,
    burn_subtitles: bool = False,
) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
    ]

    filter_parts = []
    current_video = "[0:v]"

    if watermark_path and Path(watermark_path).exists():
        cmd.extend(["-i", str(watermark_path)])
        filter_parts.append(
            f"{current_video}[2:v]overlay=main_w-overlay_w-24:main_h-overlay_h-24[vwatermarked]"
        )
        current_video = "[vwatermarked]"

    if burn_subtitles and subtitle_path and Path(subtitle_path).exists():
        escaped = (
            Path(subtitle_path)
            .resolve()
            .as_posix()
            .replace("\\", "/")
            .replace(":", "\\:")
        )
        filter_parts.append(f"{current_video}subtitles='{escaped}'[vsubtitled]")
        current_video = "[vsubtitled]"

    if filter_parts:
        cmd.extend(["-filter_complex", ";".join(filter_parts)])

    cmd.extend(
        [
            "-map",
            current_video,
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-crf",
            "23",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-t",
            f"{float(duration):.3f}",
            str(output_path),
        ]
    )

    run(cmd)
from pathlib import Path

from src.models.schemas import CompiledPlan, SegmentSpec, Timeline, TTSSegment
from src.services.subtitles import generate_webvtt
from src.utils.ffmpeg import (
    concat_videos,
    concat_wavs,
    finalize_video,
    normalize_audio_duration,
)
from src.utils.images import create_ai_label_png


def assemble(
    job_path: Path,
    plan: CompiledPlan,
    timeline: Timeline,
    segments: list[SegmentSpec],
    tts_segments_by_event_id: dict[str, TTSSegment],
) -> tuple[Path, Path | None]:
    audio_paths = []

    for event in timeline.events:
        tts_segment = tts_segments_by_event_id.get(event.event_id)
        if tts_segment:
            audio_paths.append(tts_segment.audio_path)

    final_audio = job_path / "final_audio.wav"
    concat_wavs(audio_paths, final_audio)
    normalize_audio_duration(final_audio, final_audio, plan.target_duration_seconds)

    video_paths = [s.video_path for s in segments if s.video_path]

    if not video_paths:
        raise RuntimeError("No video segments were generated.")

    joined_video = job_path / "joined_video.mp4"
    concat_videos(video_paths, joined_video)

    label_path = job_path / "ai_label.png"

    if plan.safety.visible_label:
        create_ai_label_png(label_path, plan.safety.label_text)
    else:
        label_path = None

    subtitle_path = None

    if plan.subtitles.enabled:
        subtitle_path = job_path / "subtitles.vtt"
        generate_webvtt(timeline, tts_segments_by_event_id, subtitle_path)

    output_path = job_path / "final_video.mp4"

    finalize_video(
        video_path=joined_video,
        audio_path=final_audio,
        watermark_path=label_path,
        output_path=output_path,
        duration=plan.target_duration_seconds,
        subtitle_path=subtitle_path,
        burn_subtitles=plan.subtitles.burn_in,
    )

    return output_path, subtitle_path
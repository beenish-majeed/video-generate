from pathlib import Path
import pytest
from src.services.slideshow_compositor import SlideshowCompositor
from src.utils.ffmpeg import finalize_video, create_placeholder_video, make_silence_wav, probe_format_tags


def test_finalize_video_embeds_ai_metadata_tags(tmp_path):
    video_raw = tmp_path / "raw.mp4"
    audio_raw = tmp_path / "audio.wav"
    out_video = tmp_path / "assembled_with_metadata.mp4"

    create_placeholder_video(video_raw, duration=1.0, resolution="320x240", fps=25)
    make_silence_wav(audio_raw, seconds=1.0)

    finalize_video(
        video_path=video_raw,
        audio_path=audio_raw,
        watermark_path=None,
        output_path=out_video,
        duration=1.0,
    )

    assert out_video.exists()
    tags = probe_format_tags(out_video)

    assert tags.get("title") == "AI Generated Video"
    assert tags.get("artist") == "Local AI Video Generator"
    assert "AI-generated synthetic media" in tags.get("comment", "")
    assert "AI Video Generator" in tags.get("description", "")
    assert tags.get("copyright") == "AI-generated synthetic media"


def test_slideshow_multiplex_embeds_ai_metadata_tags(tmp_path):
    video_raw = tmp_path / "slide_raw.mp4"
    audio_raw = tmp_path / "slide_audio.wav"
    out_video = tmp_path / "slideshow_with_metadata.mp4"

    create_placeholder_video(video_raw, duration=1.0, resolution="320x240", fps=25)
    make_silence_wav(audio_raw, seconds=1.0)

    SlideshowCompositor.multiplex_final(
        video_path=video_raw,
        audio_path=audio_raw,
        output_path=out_video,
        target_duration=1.0,
        watermark_path=None,
    )

    assert out_video.exists()
    tags = probe_format_tags(out_video)

    assert tags.get("title") == "AI Generated Video"
    assert tags.get("artist") == "Local AI Video Generator"
    assert "AI-generated synthetic media" in tags.get("comment", "")
    assert tags.get("copyright") == "AI-generated synthetic media"

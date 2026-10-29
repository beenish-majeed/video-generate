import pytest
from pathlib import Path
from src.services.slideshow_compositor import SlideshowCompositor
from src.utils.ffmpeg import create_placeholder_video, make_silence_wav


def test_slideshow_multiplex_final_handles_special_character_subtitles(tmp_path: Path):
    # Directory and filename with brackets and spaces
    special_dir = tmp_path / "test [special space]"
    special_dir.mkdir(parents=True, exist_ok=True)

    video_p = special_dir / "base_video.mp4"
    create_placeholder_video(video_p, duration=2.0, resolution="320x240", fps=25)

    audio_p = special_dir / "base_audio.wav"
    make_silence_wav(audio_p, 2.0)

    sub_p = special_dir / "subtitles [scene '1'].vtt"
    sub_p.write_text(
        "WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.800\nTesting robust subtitle escaping.\n",
        encoding="utf-8",
    )

    out_p = special_dir / "final_out.mp4"

    res = SlideshowCompositor.multiplex_final(
        video_path=video_p,
        audio_path=audio_p,
        output_path=out_p,
        target_duration=2.0,
        subtitle_path=sub_p,
        burn_subtitles=True,
    )

    assert res.exists()
    assert res.stat().st_size > 0

import pytest
from pathlib import Path
from unittest.mock import patch

from src.models.schemas import CompiledPlan, SegmentSpec, Timeline, TimelineEvent, TTSSegment
from src.services.assembler import assemble
from src.utils.ffmpeg import make_silence_wav, create_placeholder_video


def test_assembler_music_mixing_failure_falls_back_without_name_error(tmp_path: Path):
    job_path = tmp_path / "job_test_music_fallback"
    job_path.mkdir(parents=True, exist_ok=True)

    # Create dummy segment video and speech audio
    speech_wav = job_path / "speech.wav"
    make_silence_wav(speech_wav, 5.0)

    seg_vid = job_path / "seg1.mp4"
    create_placeholder_video(seg_vid, duration=5.0, resolution="320x240", fps=25)

    ev = TimelineEvent(event_id="ev1", type="speech", start_s=0.0, end_s=5.0, text="Hello world")
    timeline = Timeline(events=[ev], total_duration_seconds=5.0)
    tts_map = {"ev1": TTSSegment(event_id="ev1", audio_path=str(speech_wav), duration_seconds=5.0)}
    segments = [SegmentSpec(segment_id="seg1", index=0, start_s=0.0, end_s=5.0, duration_s=5.0, video_path=str(seg_vid))]

    plan = CompiledPlan(
        job_id="job_test_music_fallback",
        target_duration_seconds=5.0,
        duration_source="prompt",
        language="en",
        script="Hello world, this is a test script for audio fallback.",
        prompt_original="Test prompt",
        music_preset_id="calm",
    )

    # Simulate mix_background_music throwing a runtime error
    with patch("src.utils.ffmpeg.mix_background_music", side_effect=RuntimeError("Simulated FFmpeg mix failure")):
        # Must NOT raise NameError: name 'logger' is not defined
        out_vid, sub_path = assemble(
            job_path=job_path,
            plan=plan,
            timeline=timeline,
            segments=segments,
            tts_segments_by_event_id=tts_map,
        )

    assert out_vid.exists()
    assert plan.music_applied is False
    assert "Simulated FFmpeg mix failure" in str(plan.music_error)

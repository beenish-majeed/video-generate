import wave
import struct
import pytest
from pathlib import Path
from src.models.schemas import CompiledPlan, SegmentSpec, Timeline, TimelineEvent, TTSSegment
from src.services.assembler import assemble
from src.utils.ffmpeg import create_placeholder_video, probe_duration


def make_real_wav(path: Path, duration_seconds: float, sample_rate: int = 22050):
    path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = int(sample_rate * duration_seconds)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # Low volume sine wave
        audio_data = b"".join(struct.pack("<h", int(1000 * (i % 100) / 100)) for i in range(n_frames))
        wf.writeframes(audio_data)


def test_assemble_speech_28s_with_target_30s_passes_and_outputs_30s(tmp_path):
    job_dir = tmp_path / "job_pass_28s"
    job_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create real 28s speech audio file
    audio_file = job_dir / "speech_0001.wav"
    make_real_wav(audio_file, duration_seconds=28.0)
    assert abs(probe_duration(audio_file) - 28.0) < 0.2

    # 2. Create real 30s video segment
    video_file = job_dir / "segment_0001.mp4"
    create_placeholder_video(video_file, duration=30.0, resolution="640x480", fps=25)
    assert abs(probe_duration(video_file) - 30.0) < 0.2

    plan = CompiledPlan(
        job_id="job_pass_28s",
        target_duration_seconds=30.0,
        duration_source="user_override",
        prompt="30s video",
        script="Long speech script...",
        language="en-US",
        prompt_original="30s video",
    )

    timeline = Timeline(
        events=[
            TimelineEvent(event_id="speech_0001", type="speech", start_s=0.0, end_s=28.0, text="Speech"),
            TimelineEvent(event_id="hold_end", type="hold", start_s=28.0, end_s=30.0),
        ],
        total_duration_seconds=30.0,
    )

    segments = [
        SegmentSpec(
            segment_id="segment_0001",
            index=0,
            start_s=0.0,
            end_s=30.0,
            duration_s=30.0,
            video_path=str(video_file),
        )
    ]

    tts_map = {
        "speech_0001": TTSSegment(event_id="speech_0001", audio_path=str(audio_file), duration_seconds=28.0)
    }

    output_path, subtitle_path = assemble(
        job_path=job_dir,
        plan=plan,
        timeline=timeline,
        segments=segments,
        tts_segments_by_event_id=tts_map,
    )

    assert output_path.exists()
    actual_dur = probe_duration(output_path)
    assert abs(actual_dur - 30.0) < 0.5


def test_assemble_speech_10s_with_target_30s_raises_error(tmp_path):
    job_dir = tmp_path / "job_fail_10s"
    job_dir.mkdir(parents=True, exist_ok=True)

    audio_file = job_dir / "speech_0001.wav"
    make_real_wav(audio_file, duration_seconds=10.0)
    assert abs(probe_duration(audio_file) - 10.0) < 0.2

    video_file = job_dir / "segment_0001.mp4"
    create_placeholder_video(video_file, duration=30.0, resolution="640x480", fps=25)

    plan = CompiledPlan(
        job_id="job_fail_10s",
        target_duration_seconds=30.0,
        duration_source="user_override",
        prompt="30s video",
        script="Short script...",
        language="en-US",
        prompt_original="30s video",
    )

    timeline = Timeline(
        events=[
            TimelineEvent(event_id="speech_0001", type="speech", start_s=0.0, end_s=10.0, text="Speech"),
            TimelineEvent(event_id="hold_end", type="hold", start_s=10.0, end_s=30.0),
        ],
        total_duration_seconds=30.0,
    )

    segments = [
        SegmentSpec(
            segment_id="segment_0001",
            index=0,
            start_s=0.0,
            end_s=30.0,
            duration_s=30.0,
            video_path=str(video_file),
        )
    ]

    tts_map = {
        "speech_0001": TTSSegment(event_id="speech_0001", audio_path=str(audio_file), duration_seconds=10.0)
    }

    with pytest.raises(RuntimeError) as exc_info:
        assemble(
            job_path=job_dir,
            plan=plan,
            timeline=timeline,
            segments=segments,
            tts_segments_by_event_id=tts_map,
        )

    err_msg = str(exc_info.value)
    assert "outside 10% tolerance" in err_msg
    assert "10.00s" in err_msg or "10.0" in err_msg


def test_assemble_speech_35s_with_target_30s_raises_error(tmp_path):
    job_dir = tmp_path / "job_fail_35s"
    job_dir.mkdir(parents=True, exist_ok=True)

    audio_file = job_dir / "speech_0001.wav"
    make_real_wav(audio_file, duration_seconds=35.0)
    assert abs(probe_duration(audio_file) - 35.0) < 0.2

    video_file = job_dir / "segment_0001.mp4"
    create_placeholder_video(video_file, duration=35.0, resolution="640x480", fps=25)

    plan = CompiledPlan(
        job_id="job_fail_35s",
        target_duration_seconds=30.0,
        duration_source="user_override",
        prompt="30s video",
        script="Very long script...",
        language="en-US",
        prompt_original="30s video",
    )

    timeline = Timeline(
        events=[
            TimelineEvent(event_id="speech_0001", type="speech", start_s=0.0, end_s=35.0, text="Speech"),
        ],
        total_duration_seconds=35.0,
    )

    segments = [
        SegmentSpec(
            segment_id="segment_0001",
            index=0,
            start_s=0.0,
            end_s=35.0,
            duration_s=35.0,
            video_path=str(video_file),
        )
    ]

    tts_map = {
        "speech_0001": TTSSegment(event_id="speech_0001", audio_path=str(audio_file), duration_seconds=35.0)
    }

    with pytest.raises(RuntimeError) as exc_info:
        assemble(
            job_path=job_dir,
            plan=plan,
            timeline=timeline,
            segments=segments,
            tts_segments_by_event_id=tts_map,
        )

    err_msg = str(exc_info.value)
    assert "outside 10% tolerance" in err_msg
    assert "35.00s" in err_msg or "35.0" in err_msg

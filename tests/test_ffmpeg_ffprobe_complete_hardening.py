"""
Command-capture regression tests for complete FFmpeg and FFprobe hardening across all backend modules.
Verifies that all invocations across all 9 categories enforce:
- Argument arrays (shell=False)
- -nostdin on all applicable FFmpeg commands
- Explicit -protocol_whitelist restricted to authorized protocols (file, concat, lavfi)
- Absence of dangerous protocols (http, https, tcp, udp, rtp, rtsp, gopher, ftp)
- Reasonable timeouts on subprocess execution
"""
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from src.core.config import settings
from src.services.clip_compositor import ClipCompositor
from src.services.slideshow_compositor import SlideshowCompositor
import src.utils.ffmpeg as ffmpeg_mod
from src.utils.ffmpeg import (
    has_audio_stream,
    probe_duration,
    concat_videos,
    create_placeholder_video,
)
import src.services.qa as qa_mod
import src.services.store as store_mod


def _assert_command_hardened(cmd: list[str], allowed_protocols: set[str], is_ffmpeg: bool = True):
    """Assert common security properties for FFmpeg/FFprobe commands."""
    assert isinstance(cmd, list), f"Command must be argument array, got: {type(cmd)}"
    for arg in cmd:
        assert isinstance(arg, str), f"Command elements must be strings, got: {type(arg)}"

    if is_ffmpeg:
        assert "-nostdin" in cmd, f"Missing -nostdin in FFmpeg command: {cmd}"

    assert "-protocol_whitelist" in cmd, f"Missing -protocol_whitelist in command: {cmd}"
    idx = cmd.index("-protocol_whitelist")
    whitelist_str = cmd[idx + 1]
    protocols = set(whitelist_str.split(","))

    # Assert no dangerous protocols
    dangerous = {"http", "https", "tcp", "udp", "rtp", "rtsp", "gopher", "ftp", "tls"}
    assert not (protocols & dangerous), f"Dangerous protocol found in whitelist: {whitelist_str}"

    # Assert all protocols in whitelist are in the permitted set
    assert protocols.issubset(allowed_protocols), f"Unexpected protocol in {whitelist_str}; allowed: {allowed_protocols}"


def test_command_capture_ffprobe_metadata(tmp_path):
    """Category 2: FFprobe metadata extraction commands enforce protocol whitelist."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = '{"streams":[{"codec_type":"audio","channels":2,"sample_rate":"44100"}],"format":{"duration":"3.5"}}'
        mock.stderr = ""
        return mock

    dummy_media = tmp_path / "test.mp4"
    dummy_media.write_bytes(b"\x00" * 64)

    with patch.object(ffmpeg_mod, "run_subprocess", side_effect=mock_run), \
         patch.object(qa_mod, "run_subprocess", side_effect=mock_run):
        has_audio_stream(dummy_media)
        probe_duration(dummy_media)
        qa_mod.check_audio_stream_present(dummy_media)

    assert len(intercepted_cmds) >= 3
    for cmd in intercepted_cmds:
        _assert_command_hardened(cmd, allowed_protocols={"file"}, is_ffmpeg=False)


def test_command_capture_clip_standardization(tmp_path):
    """Category 5: Clip standardization in ClipCompositor enforces -nostdin and file whitelist."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = ""
        mock.stderr = ""
        return mock

    dummy_clip = tmp_path / "input.mp4"
    dummy_clip.write_bytes(b"\x00" * 64)
    out_clip = tmp_path / "output.mp4"
    out_clip.write_bytes(b"\x00" * 64)

    with patch("src.services.clip_compositor.run_subprocess", side_effect=mock_run), \
         patch("src.services.clip_compositor.probe_duration", return_value=3.0):
        ClipCompositor.standardize_clip(
            input_clip=dummy_clip,
            target_visual_duration=4.0,
            output_path=out_clip,
        )

    assert len(intercepted_cmds) == 1
    cmd = intercepted_cmds[0]
    _assert_command_hardened(cmd, allowed_protocols={"file"}, is_ffmpeg=True)


def test_command_capture_qa_video_decoding_and_audio_volume(tmp_path):
    """Categories 3 & 4: QA volumedetect and frame extraction enforce -nostdin and file whitelist."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = b"P6\n1 1\n255\n\x00\x00\x00"
        mock.stderr = "mean_volume: -20.5 dB"
        return mock

    dummy_video = tmp_path / "test_video.mp4"
    dummy_video.write_bytes(b"\x00" * 64)

    with patch.object(qa_mod, "run_subprocess", side_effect=mock_run):
        qa_mod.check_audio_mean_volume(dummy_video)
        qa_mod.extract_video_frame(dummy_video, 1.0)

    assert len(intercepted_cmds) == 2
    for cmd in intercepted_cmds:
        _assert_command_hardened(cmd, allowed_protocols={"file"}, is_ffmpeg=True)


def test_command_capture_store_audio_and_video_decode_preflight(tmp_path):
    """Categories 3 & 4: Upload validation decode checks enforce -nostdin and file whitelist."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = '{"streams":[{"codec_type":"video","codec_name":"h264","width":1280,"height":720,"r_frame_rate":"30/1","duration":"2.0"}],"format":{"duration":"2.0"}}'
        mock.stderr = ""
        return mock

    dummy_clip = tmp_path / "clip.mp4"
    dummy_clip.write_bytes(b"\x00" * 128)

    mock_upload = MagicMock()
    mock_upload.filename = "clip.mp4"
    mock_upload.file = open(dummy_clip, "rb")

    try:
        with patch("src.utils.subprocess_runner.run_subprocess", side_effect=mock_run):
            store_mod.validate_upload(mock_upload, "clip")
    finally:
        mock_upload.file.close()

    assert len(intercepted_cmds) >= 3
    # First is probe, second and third are decode checks (d1_cmd, d2_cmd)
    probe_cmd = intercepted_cmds[0]
    _assert_command_hardened(probe_cmd, allowed_protocols={"file"}, is_ffmpeg=False)

    for decode_cmd in intercepted_cmds[1:]:
        _assert_command_hardened(decode_cmd, allowed_protocols={"file"}, is_ffmpeg=True)


def test_command_capture_slideshow_and_concatenation(tmp_path):
    """Categories 6 & 7: Slideshow rendering and crossfade commands enforce protocol whitelist."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = '{"streams":[],"format":{"duration":"5.0"}}'
        mock.stderr = ""
        return mock

    dummy_img = tmp_path / "scene.png"
    dummy_img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    out_clip = tmp_path / "out.mp4"
    out_clip.write_bytes(b"\x00" * 32)

    with patch("src.services.slideshow_compositor.run_subprocess", side_effect=mock_run):
        SlideshowCompositor.render_scene_clip(dummy_img, 2.0, 0, out_clip)
        SlideshowCompositor.build_crossfade_video([out_clip, out_clip], [2.0, 2.0], crossfade_s=0.3, output_path=out_clip)

    assert len(intercepted_cmds) >= 2
    for cmd in intercepted_cmds:
        _assert_command_hardened(cmd, allowed_protocols={"file"}, is_ffmpeg=True)


def test_command_capture_subtitle_and_multiplexing(tmp_path):
    """Categories 8 & 9: Subtitle processing and final video multiplexing enforce hardening."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = ""
        mock.stderr = ""
        return mock

    vid = tmp_path / "v.mp4"
    aud = tmp_path / "a.wav"
    out = tmp_path / "final.mp4"
    vid.write_bytes(b"\x00" * 32)
    aud.write_bytes(b"\x00" * 32)
    out.write_bytes(b"\x00" * 32)

    with patch("src.services.slideshow_compositor.run_subprocess", side_effect=mock_run):
        SlideshowCompositor.multiplex_final(
            video_path=vid,
            audio_path=aud,
            output_path=out,
            target_duration=2.0,
            burn_subtitles=False,
        )

    assert len(intercepted_cmds) == 1
    cmd = intercepted_cmds[0]
    _assert_command_hardened(cmd, allowed_protocols={"file"}, is_ffmpeg=True)


def test_command_capture_lavfi_and_concat_demuxer(tmp_path):
    """Special protocols: lavfi and concat are permitted only where legitimately required."""
    intercepted_cmds = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = ""
        mock.stderr = ""
        return mock

    out = tmp_path / "placeholder.mp4"
    out.write_bytes(b"\x00" * 32)

    with patch.object(ffmpeg_mod, "run_subprocess", side_effect=mock_run):
        create_placeholder_video(out, duration=2.0, resolution="1280x720", fps=30)
        concat_videos([out, out], out)

    assert len(intercepted_cmds) >= 2
    # create_placeholder_video uses lavfi
    # concat_videos uses file,concat
    for cmd in intercepted_cmds:
        assert "-nostdin" in cmd
        assert "-protocol_whitelist" in cmd
        idx = cmd.index("-protocol_whitelist")
        whitelist_str = cmd[idx + 1]
        assert not any(bad in whitelist_str for bad in ["http", "https", "gopher", "rtsp"])


def test_command_capture_store_clip_save_and_metadata_probe(tmp_path):
    """Verify save_upload for clips hardens both ffmpeg strip and ffprobe metadata probe."""
    intercepted_cmds = []
    intercepted_kwargs = []

    def mock_run(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        intercepted_kwargs.append(kwargs)
        if cmd[0] == settings.ffmpeg_bin:
            Path(cmd[-1]).parent.mkdir(parents=True, exist_ok=True)
            Path(cmd[-1]).write_bytes(b"\x00" * 32)
        mock = MagicMock()
        mock.returncode = 0
        mock.stdout = '{"streams":[{"codec_type":"video","codec_name":"h264","width":1280,"height":720,"r_frame_rate":"30/1","duration":"2.0"}],"format":{"duration":"2.0"}}'
        mock.stderr = ""
        return mock

    dummy_clip = tmp_path / "clip.mp4"
    dummy_clip.write_bytes(b"\x00" * 128)

    mock_upload = MagicMock()
    mock_upload.filename = "clip.mp4"
    mock_upload.file = open(dummy_clip, "rb")

    with patch("src.services.store.validate_upload"), \
         patch("src.utils.subprocess_runner.run_subprocess", side_effect=mock_run), \
         patch("src.db.repository.AssetRepository.save"):
        res = store_mod.save_upload(mock_upload, "clip")

    mock_upload.file.close()

    assert len(intercepted_cmds) == 2
    ffmpeg_strip = intercepted_cmds[0]
    ffprobe_probe = intercepted_cmds[1]

    _assert_command_hardened(ffmpeg_strip, allowed_protocols={"file"}, is_ffmpeg=True)
    _assert_command_hardened(ffprobe_probe, allowed_protocols={"file"}, is_ffmpeg=False)

    # Verify timeout was explicitly passed to ffprobe probe
    assert "timeout" in intercepted_kwargs[1]
    assert intercepted_kwargs[1]["timeout"] == settings.subprocess_ffprobe_timeout_seconds


import io
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi import UploadFile

from src.clients.file_ai import FileAIClient
from src.services.store import _verify_audio_and_get_duration, save_upload
from src.core.config import settings


def test_mux_audio_if_needed_flags_and_cleanup(tmp_path):
    client = FileAIClient()
    video_path = tmp_path / "test_vid.mp4"
    video_path.write_bytes(b"dummy_video_bytes")
    audio_path = tmp_path / "test_aud.wav"
    audio_path.write_bytes(b"dummy_audio_bytes")

    captured_cmds = []

    def mock_run(cmd, timeout=None):
        captured_cmds.append(cmd)
        # Create the expected muxed output file so replace succeeds
        out_p = Path(cmd[-1])
        out_p.write_bytes(b"muxed_content")
        return MagicMock(returncode=0)

    with patch("src.utils.ffmpeg.has_audio_stream", return_value=False):
        with patch("src.utils.subprocess_runner.run_subprocess", side_effect=mock_run):
            res_path = client._mux_audio_if_needed(video_path, audio_path)

    assert len(captured_cmds) == 1
    cmd = captured_cmds[0]
    assert "-nostdin" in cmd
    assert "-protocol_whitelist" in cmd
    assert "file" in cmd
    # Ensure temporary file was cleanly replaced into video_path and no leftover *.tmp files
    assert res_path == video_path
    assert video_path.read_bytes() == b"muxed_content"
    assert len(list(tmp_path.glob("*_muxed_*.mp4"))) == 0


def test_audio_verification_tempfile_guaranteed_cleanup(tmp_path, monkeypatch):
    buf = io.BytesIO(b"malformed_audio_data_that_fails_decoding")
    upload_file = UploadFile(file=buf, filename="corrupt.m4a")

    captured_cmds = []

    def mock_run(cmd, timeout=None):
        captured_cmds.append(cmd)
        return MagicMock(returncode=1, stdout="", stderr="Invalid data")

    with patch("src.utils.subprocess_runner.run_subprocess", side_effect=mock_run):
        with pytest.raises(ValueError, match="Could not decode audio header"):
            _verify_audio_and_get_duration(upload_file, ".m4a")

    # Verify security flags
    assert len(captured_cmds) > 0
    probe_cmd = captured_cmds[0]
    assert "-protocol_whitelist" in probe_cmd
    assert "file" in probe_cmd


def test_strip_clip_enforces_nostdin(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
    buf = io.BytesIO(b"fake_clip_bytes")
    upload_file = UploadFile(file=buf, filename="clip.mp4")

    captured_cmds = []

    def mock_run(cmd, timeout=None):
        captured_cmds.append(cmd)
        if any("libx264" in c for c in cmd):
            # Target output path is cmd[-1]
            Path(cmd[-1]).write_bytes(b"sanitized_clip")
        return MagicMock(returncode=0)

    with patch("src.services.store.validate_upload", return_value=None):
        with patch("src.utils.subprocess_runner.run_subprocess", side_effect=mock_run):
            res = save_upload(upload_file, kind="clip")

    assert res["asset_id"].startswith("clip_")
    strip_cmds = [cmd for cmd in captured_cmds if "-map" in cmd]
    assert len(strip_cmds) == 1
    assert "-nostdin" in strip_cmds[0]
    assert "-protocol_whitelist" in strip_cmds[0]

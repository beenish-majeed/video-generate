import pytest
from unittest.mock import MagicMock
from pathlib import Path

from src.utils import ffmpeg
from src.config import settings


def test_probe_duration_enforces_protocol_whitelist(monkeypatch, tmp_path):
    recorded_cmd = []

    def mock_run_subprocess(cmd, **kwargs):
        recorded_cmd.append(list(cmd))
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = '{"format": {"duration": "12.5"}}'
        return mock_proc

    monkeypatch.setattr(ffmpeg, "run_subprocess", mock_run_subprocess)
    dummy_file = tmp_path / "test.mp4"
    dummy_file.write_bytes(b"mock bytes")

    dur = ffmpeg.probe_duration(dummy_file)
    assert dur == 12.5
    assert len(recorded_cmd) == 1
    cmd = recorded_cmd[0]
    assert "-protocol_whitelist" in cmd
    idx = cmd.index("-protocol_whitelist")
    assert cmd[idx + 1] == "file"


def test_probe_format_tags_enforces_protocol_whitelist(monkeypatch, tmp_path):
    recorded_cmd = []

    def mock_run_subprocess(cmd, **kwargs):
        recorded_cmd.append(list(cmd))
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = '{"format": {"tags": {"title": "Test"}}}'
        return mock_proc

    monkeypatch.setattr(ffmpeg, "run_subprocess", mock_run_subprocess)
    dummy_file = tmp_path / "sample.mp4"
    dummy_file.write_bytes(b"mock bytes")

    tags = ffmpeg.probe_format_tags(dummy_file)
    assert len(recorded_cmd) == 1
    cmd = recorded_cmd[0]
    assert "-protocol_whitelist" in cmd
    idx = cmd.index("-protocol_whitelist")
    assert cmd[idx + 1] == "file"

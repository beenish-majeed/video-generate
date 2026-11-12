import io
from pathlib import Path
import numpy as np
from PIL import Image
import pytest

from src.services.qa import (
    check_final,
    check_audio_stream_present,
    check_audio_mean_volume,
    check_video_not_static,
)


def test_check_audio_stream_present_on_valid_wav():
    wav_path = Path("assets/voices/default_voice.wav")
    if not wav_path.exists():
        pytest.skip("default_voice.wav not found")
    ok, msg = check_audio_stream_present(wav_path)
    assert ok is True
    assert "present" in msg.lower()


def test_check_audio_mean_volume_on_valid_wav():
    wav_path = Path("assets/voices/default_voice.wav")
    if not wav_path.exists():
        pytest.skip("default_voice.wav not found")
    passed, mean_vol, msg = check_audio_mean_volume(wav_path, min_mean_volume_db=-50.0)
    assert passed is True
    assert mean_vol is not None
    assert mean_vol > -50.0
    assert "mean volume" in msg.lower()


def test_check_video_not_static_detects_motion(tmp_path):
    # Verify check_video_not_static detects frame changes
    from unittest.mock import patch

    f1 = np.zeros((100, 100, 3), dtype=np.float32)
    f2 = np.ones((100, 100, 3), dtype=np.float32) * 50.0

    dummy_video = tmp_path / "dummy.mp4"
    dummy_video.write_bytes(b"dummy_content")

    with patch("src.services.qa.extract_video_frame", side_effect=[f1, f2]):
        passed, mae, msg = check_video_not_static(dummy_video, actual_duration=10.0, min_mae=1.0)
        assert passed is True
        assert mae == 50.0


def test_check_video_not_static_fails_on_identical_frames(tmp_path):
    # Verify check_video_not_static fails when frames are identical
    from unittest.mock import patch

    f1 = np.ones((100, 100, 3), dtype=np.float32) * 128.0
    f2 = np.ones((100, 100, 3), dtype=np.float32) * 128.0

    dummy_video = tmp_path / "dummy_static.mp4"
    dummy_video.write_bytes(b"dummy_content")

    with patch("src.services.qa.extract_video_frame", side_effect=[f1, f2]):
        passed, mae, msg = check_video_not_static(dummy_video, actual_duration=10.0, min_mae=1.0)
        assert passed is False
        assert mae == 0.0
        assert "MAE 0.00" in msg


def test_check_final_rejects_silent_or_static_video(tmp_path):
    # Verify check_final enforces all acceptance criteria
    from unittest.mock import patch

    dummy_video = tmp_path / "test_vid.mp4"
    dummy_video.write_bytes(b"dummy_video")

    with patch("src.services.qa.probe_duration", return_value=10.0), \
         patch("src.services.qa.check_audio_stream_present", return_value=(True, "Audio ok")), \
         patch("src.services.qa.check_audio_mean_volume", return_value=(False, -55.0, "Too quiet")), \
         patch("src.services.qa.check_video_not_static", return_value=(True, 25.0, "Motion ok")):

        res = check_final(dummy_video, expected_duration=10.0, tolerance=1.0)
        assert res["passed"] is False
        assert any("Too quiet" in err for err in res["errors"])


def test_picture_to_video_ken_burns_acceptance_passed(tmp_path):
    # Verify picture-to-video with Ken Burns motion passes final QA
    from unittest.mock import patch

    p2v_video = tmp_path / "p2v_output.mp4"
    p2v_video.write_bytes(b"p2v_content")

    with patch("src.services.qa.probe_duration", return_value=15.0), \
         patch("src.services.qa.check_audio_stream_present", return_value=(True, "Audio ok")), \
         patch("src.services.qa.check_audio_mean_volume", return_value=(True, -28.0, "Audible")), \
         patch("src.services.qa.check_video_not_static", return_value=(True, 6.5, "Ken Burns Motion ok")):

        res = check_final(p2v_video, expected_duration=15.0, tolerance=1.5)
        assert res["passed"] is True
        assert res["audio_stream_present"] is True
        assert res["mean_volume_db"] == -28.0
        assert res["frame_difference_mae"] == 6.5
        assert len(res["errors"]) == 0

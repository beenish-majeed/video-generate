import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.services.video_provider import (
    BaseVideoProvider,
    FalAIVideoProvider,
    KenBurnsVideoProvider,
    VideoProviderError,
    VideoResult,
    get_video_provider,
)


def test_fal_video_provider_configuration():
    # When no key is given
    prov_empty = FalAIVideoProvider(api_key="")
    assert prov_empty.is_configured is False
    status = prov_empty.check_account_status()
    assert status["status"] == "unconfigured"

    # When fal_sk_ key is provided
    prov_valid = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")
    assert prov_valid.is_configured is True


def test_fal_video_provider_detects_exhausted_balance():
    import urllib.error
    prov = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")

    mock_err = urllib.error.HTTPError(
        url="https://rest.fal.ai",
        code=403,
        msg="Forbidden",
        hdrs={},
        fp=MagicMock(read=lambda: b'{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing"}')
    )

    with patch("urllib.request.urlopen", side_effect=mock_err):
        status = prov.check_account_status()
        assert status["status"] == "exhausted_balance"
        assert "Exhausted balance" in status["message"]
        assert "fal.ai/dashboard/billing" in status["message"]


def test_fal_video_provider_raises_clear_error_on_exhausted_balance(tmp_path):
    prov = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")
    dummy_img = tmp_path / "portrait.jpg"
    dummy_img.write_bytes(b"dummy_image")

    with patch.object(prov, "check_account_status", return_value={
        "status": "exhausted_balance",
        "message": "User is locked: Exhausted balance. Top up your balance at fal.ai/dashboard/billing",
    }):
        with pytest.raises(VideoProviderError) as exc_info:
            prov.generate_image_to_video(
                image_path=dummy_img,
                prompt="Realistic subject motion",
                duration_seconds=5.0,
            )
        assert "Exhausted balance" in str(exc_info.value)
        assert "fal.ai/dashboard/billing" in str(exc_info.value)


def test_fal_video_provider_generates_video_preserving_identity(tmp_path):
    prov = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")
    dummy_img = tmp_path / "portrait.jpg"
    dummy_img.write_bytes(b"dummy_image")
    output_mp4 = tmp_path / "out.mp4"

    with patch.object(prov, "check_account_status", return_value={"status": "ready", "message": "ready"}), \
         patch("fal_client.upload_file", return_value="https://fal.media/portrait.jpg") as mock_upload, \
         patch("fal_client.subscribe", return_value={"video": {"url": "https://fal.media/gen.mp4"}}) as mock_sub, \
         patch("src.clients.file_ai.FileAIClient._safe_download_file") as mock_dl, \
         patch("src.services.video_provider.probe_duration", return_value=5.0):

        res = prov.generate_image_to_video(
            image_path=dummy_img,
            prompt="A woman smiling in soft sunlight",
            duration_seconds=5.0,
            output_path=output_mp4,
        )

        assert res.is_ai_generated is True
        assert res.provider_used == "fal_ai"
        assert res.model_name == FalAIVideoProvider.DEFAULT_MODEL
        assert "preserving subject identity" in res.reason

        # Assert fal_client was called with identity preservation instructions
        mock_upload.assert_called_once_with(str(dummy_img))
        args = mock_sub.call_args[1]["arguments"]
        assert args["image_url"] == "https://fal.media/portrait.jpg"
        assert "maintaining consistent subject identity" in args["prompt"]


def test_ken_burns_provider_explicitly_labeled_as_non_ai(tmp_path):
    prov = KenBurnsVideoProvider()
    dummy_img = tmp_path / "photo.jpg"
    dummy_img.write_bytes(b"dummy_image")
    out_mp4 = tmp_path / "kb.mp4"

    with patch("src.services.slideshow_compositor.SlideshowCompositor.render_scene_clip"):
        res = prov.generate_image_to_video(
            image_path=dummy_img,
            duration_seconds=4.0,
            output_path=out_mp4,
        )

        assert res.is_ai_generated is False
        assert res.provider_used == "ken_burns"
        assert "Ken Burns" in res.reason


def test_get_video_provider_factory():
    # Prefer slideshow yields KenBurns
    p1 = get_video_provider(prefer_slideshow=True)
    assert isinstance(p1, KenBurnsVideoProvider)

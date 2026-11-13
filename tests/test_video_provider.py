import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.services.video_provider import (
    BaseVideoProvider,
    GoogleVeoVideoProvider,
    FalAIVideoProvider,
    KenBurnsVideoProvider,
    VideoProviderError,
    VideoResult,
    get_video_provider,
)


def test_google_veo_provider_configuration():
    # When no key is given
    prov_empty = GoogleVeoVideoProvider(api_key="")
    assert prov_empty.is_configured is False
    status = prov_empty.check_account_status()
    assert status["status"] == "unconfigured"

    # When key is provided
    prov_valid = GoogleVeoVideoProvider(api_key="AIzaSyTestKey12345678901234567890")
    assert prov_valid.is_configured is True


def test_google_veo_provider_text_to_video(tmp_path):
    prov = GoogleVeoVideoProvider(api_key="AIzaSyTestKey12345678901234567890")
    output_mp4 = tmp_path / "veo_t2v.mp4"

    mock_op = MagicMock()
    mock_op.done = True
    mock_vid = MagicMock()
    mock_vid.video.video_bytes = b"fake_mp4_bytes"
    mock_vid.video.uri = None
    mock_op.result.generated_videos = [mock_vid]

    mock_client = MagicMock()
    mock_client.models.generate_videos.return_value = mock_op

    with patch.object(prov, "check_account_status", return_value={"status": "ready", "message": "ready"}), \
         patch("google.genai.Client", return_value=mock_client), \
         patch("src.services.video_provider.probe_duration", return_value=5.0):

        res = prov.generate_text_to_video(
            prompt="A majestic eagle flying over snow-covered mountains",
            duration_seconds=5.0,
            output_path=output_mp4,
        )

        assert res.is_ai_generated is True
        assert res.provider_used == "google_veo"
        assert res.model_name == GoogleVeoVideoProvider.DEFAULT_MODEL
        assert "Google Veo" in res.reason
        assert output_mp4.exists()
        assert output_mp4.read_bytes() == b"fake_mp4_bytes"


def test_google_veo_provider_image_to_video(tmp_path):
    prov = GoogleVeoVideoProvider(api_key="AIzaSyTestKey12345678901234567890")
    dummy_img = tmp_path / "portrait.png"
    dummy_img.write_bytes(b"dummy_png_bytes")
    output_mp4 = tmp_path / "veo_i2v.mp4"

    mock_op = MagicMock()
    mock_op.done = True
    mock_vid = MagicMock()
    mock_vid.video.video_bytes = b"fake_mp4_bytes"
    mock_vid.video.uri = None
    mock_op.result.generated_videos = [mock_vid]

    mock_client = MagicMock()
    mock_client.models.generate_videos.return_value = mock_op

    with patch.object(prov, "check_account_status", return_value={"status": "ready", "message": "ready"}), \
         patch("google.genai.Client", return_value=mock_client), \
         patch("src.services.video_provider.probe_duration", return_value=5.0):

        res = prov.generate_image_to_video(
            image_path=dummy_img,
            prompt="Natural smile and gentle head turn",
            duration_seconds=5.0,
            output_path=output_mp4,
        )

        assert res.is_ai_generated is True
        assert res.provider_used == "google_veo"
        assert "preserving subject identity" in res.reason
        assert output_mp4.exists()


def test_fal_video_provider_configuration():
    prov_empty = FalAIVideoProvider(api_key="")
    assert prov_empty.is_configured is False
    status = prov_empty.check_account_status()
    assert status["status"] == "unconfigured"

    prov_valid = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")
    assert prov_valid.is_configured is True


def test_fal_video_provider_detects_exhausted_balance():
    prov = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")

    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.text = '{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing"}'

    with patch("httpx.Client.get", return_value=mock_resp):
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
        assert res.model_name == FalAIVideoProvider.DEFAULT_I2V_MODEL
        assert "preserving subject identity" in res.reason

        mock_upload.assert_called_once_with(str(dummy_img))
        args = mock_sub.call_args[1]["arguments"]
        assert args["image_url"] == "https://fal.media/portrait.jpg"
        assert "maintaining consistent subject identity" in args["prompt"]


def test_fal_video_provider_text_to_video(tmp_path):
    prov = FalAIVideoProvider(api_key="fal_sk_testkey12345678901234567890")
    output_mp4 = tmp_path / "t2v.mp4"

    with patch.object(prov, "check_account_status", return_value={"status": "ready", "message": "ready"}), \
         patch("fal_client.subscribe", return_value={"video": {"url": "https://fal.media/t2v.mp4"}}), \
         patch("src.clients.file_ai.FileAIClient._safe_download_file"), \
         patch("src.services.video_provider.probe_duration", return_value=5.0):

        res = prov.generate_text_to_video(
            prompt="A futuristic cityscape with flying vehicles",
            duration_seconds=5.0,
            output_path=output_mp4,
        )

        assert res.is_ai_generated is True
        assert res.provider_used == "fal_ai"
        assert res.model_name == FalAIVideoProvider.DEFAULT_T2V_MODEL


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

    # Google Veo request
    p2 = get_video_provider(provider_name="google_veo")
    assert isinstance(p2, GoogleVeoVideoProvider)

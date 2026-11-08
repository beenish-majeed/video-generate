import pytest
from pathlib import Path
from unittest.mock import MagicMock
import httpx
from src.clients.file_ai import (
    FileAIClient,
    FileAIError,
    _sanitize_error_message,
    _validate_download_url,
)
from src.core.api_config import FileAIConfig


def test_file_ai_client_unconfigured_sandbox(tmp_path):
    config = FileAIConfig(api_key="")
    client = FileAIClient(config=config)
    assert client.is_configured is False

    # Test script generation in sandbox mode
    script = client.generate_script(prompt="A peaceful walk in the woods", target_duration_seconds=10.0)
    assert isinstance(script, str)
    assert len(script.split()) >= 15

    # Test scene planning in sandbox mode
    scenes = client.generate_scene_plan(script=script, target_duration_seconds=10.0)
    assert len(scenes) >= 1
    assert "start_time" in scenes[0]
    assert "text" in scenes[0]

    # Test speech synthesis in sandbox mode
    wav_path = tmp_path / "speech.wav"
    speech_res = client.synthesize_speech(text="Hello world test", output_path=wav_path)
    assert wav_path.exists()
    assert speech_res["duration_seconds"] > 0
    assert len(speech_res["word_timestamps"]) == 3

    # Test avatar video segment generation in sandbox mode
    from PIL import Image
    img_path = tmp_path / "avatar.jpg"
    img = Image.new("RGB", (640, 640), color=(100, 150, 200))
    img.save(img_path)

    mp4_path = tmp_path / "avatar_clip.mp4"
    out_clip = client.generate_avatar_segment(
        image_path=img_path,
        audio_path=wav_path,
        output_path=mp4_path,
        duration_seconds=speech_res["duration_seconds"],
    )
    assert out_clip.exists()
    assert out_clip.stat().st_size > 1000


def test_sanitize_error_message(monkeypatch):
    test_key = "fileai_live_secret_123456789abcdef"
    monkeypatch.setattr("src.clients.file_ai.file_ai_config.api_key", test_key)

    raw_msg = f"HTTP 401: Invalid authentication with key {test_key} and Bearer {test_key}"
    sanitized = _sanitize_error_message(raw_msg)
    assert test_key not in sanitized
    assert "[REDACTED_API_KEY]" in sanitized


def test_file_ai_client_live_mock():
    config = FileAIConfig(api_key="fileai_valid_test_key_abc123")
    client = FileAIClient(config=config)
    assert client.is_configured is True

    # Mock _execute_request_with_retry for script generation
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"script": "This is generated directly from the live API."}
    client._execute_request_with_retry = MagicMock(return_value=mock_resp)

    res = client.generate_script(prompt="Live API prompt", target_duration_seconds=5.0)
    assert res == "This is generated directly from the live API."
    client._execute_request_with_retry.assert_called_once()


def test_fal_api_key_detection_and_headers():
    fake_fal_key = "fal_sk_1234567890abcdef1234567890abcdef:secret123456"
    config = FileAIConfig(api_key=fake_fal_key)
    assert config.is_configured is True
    assert config.is_fal is True
    assert config.provider_name == "fal.ai"
    headers = config.get_headers()
    assert headers["Authorization"] == f"Key {fake_fal_key}"
    # Verify key masking
    masked = config.masked_api_key
    assert fake_fal_key not in masked
    assert masked.startswith("fal_sk_1")


def test_file_ai_generate_image_procedural(tmp_path):
    config = FileAIConfig(api_key="")
    client = FileAIClient(config=config)
    img_out = tmp_path / "gen_image.png"
    result_path = client.generate_image(
        prompt="A serene sunset over rolling mountain peaks",
        target_path=img_out,
        style="cinematic",
    )
    assert result_path.exists()
    assert result_path.stat().st_size > 500


def test_fal_client_subscribe_mock(monkeypatch, tmp_path):
    fake_fal_key = "fal_sk_test_key_abc:secret_key_123"
    config = FileAIConfig(api_key=fake_fal_key)
    client = FileAIClient(config=config)

    # Mock fal_client.subscribe
    import fal_client
    mock_subscribe = MagicMock(return_value={"output": "In the quiet stillness of dawn, the mountains awaken with golden light."})
    monkeypatch.setattr(fal_client, "subscribe", mock_subscribe)

    script = client.generate_script("Morning sunrise", target_duration_seconds=5.0)
    assert "mountains awaken" in script
    mock_subscribe.assert_called_once()


def test_fal_client_exhausted_balance_fallback(monkeypatch, tmp_path):
    fake_fal_key = "fal_sk_test_key_exhausted:secret_xyz"
    config = FileAIConfig(api_key=fake_fal_key)
    client = FileAIClient(config=config)

    # Simulate fal_client raising balance exhausted error
    import fal_client
    def mock_exhausted(*args, **kwargs):
        raise RuntimeError("User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.")
    monkeypatch.setattr(fal_client, "subscribe", mock_exhausted)

    # Should not crash; gracefully returns high-fidelity fallback
    script = client.generate_script("Peaceful river", target_duration_seconds=5.0)
    assert isinstance(script, str)
    assert len(script.split()) >= 8


def test_validate_download_url_ssrf_protection():
    # Valid HTTPS URL passes
    _validate_download_url("https://v3.fal.media/files/monkey/sample.png")

    # Insecure scheme blocked
    with pytest.raises(FileAIError, match="Insecure scheme"):
        _validate_download_url("http://v3.fal.media/files/sample.png")

    # Localhost string blocked
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://localhost/admin")

    # Loopback IP blocked
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://127.0.0.1:8000/internal")

    # Private IP blocked
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://10.0.0.1/sensitive")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://192.168.1.1/router")

    # Cloud metadata IP blocked
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://169.254.169.254/latest/meta-data")


def test_generate_image_to_video_sandbox(tmp_path):
    from PIL import Image
    img_path = tmp_path / "input_photo.jpg"
    img = Image.new("RGB", (640, 640), color=(120, 180, 220))
    img.save(img_path)

    config = FileAIConfig(api_key="")
    client = FileAIClient(config=config)

    # 1. Without audio
    out_video = tmp_path / "photo_anim.mp4"
    res = client.generate_image_to_video(
        image_path=img_path,
        prompt="gentle ambient camera pan",
        output_path=out_video,
        duration_seconds=3.0,
    )
    assert out_video.exists()
    assert res["generation_source"] == "sandbox_fallback"
    assert res["duration_seconds"] == 3.0

    # 2. With audio
    audio_path = tmp_path / "input_speech.wav"
    speech = client.synthesize_speech("Hello picture to video test", output_path=audio_path)
    out_audio_video = tmp_path / "photo_anim_audio.mp4"
    res_audio = client.generate_image_to_video(
        image_path=img_path,
        prompt="gentle ambient camera pan",
        output_path=out_audio_video,
        audio_path=audio_path,
    )
    assert out_audio_video.exists()
    assert res_audio["generation_source"] == "sandbox_fallback"
    assert res_audio["duration_seconds"] > 0


def test_generate_image_to_video_fal_mock(monkeypatch, tmp_path):
    from PIL import Image
    img_path = tmp_path / "fal_input.jpg"
    img = Image.new("RGB", (640, 640), color=(200, 100, 50))
    img.save(img_path)

    fake_fal_key = "fal_sk_test_key_fal_p2v:secret123"
    config = FileAIConfig(api_key=fake_fal_key)
    client = FileAIClient(config=config)

    import fal_client
    monkeypatch.setattr(fal_client, "upload_file", lambda p: "https://v3.fal.media/uploaded_test.jpg")
    monkeypatch.setattr(
        fal_client,
        "subscribe",
        lambda endpoint, arguments: {"video": {"url": "https://v3.fal.media/generated_clip.mp4"}},
    )

    # Mock _safe_download_file to avoid actual network call
    def mock_download(url, target_path):
        target_path.write_bytes(b"dummy_mp4_bytes")
        return target_path

    monkeypatch.setattr(client, "_safe_download_file", mock_download)

    out_video = tmp_path / "fal_p2v.mp4"
    res = client.generate_image_to_video(
        image_path=img_path,
        output_path=out_video,
        duration_seconds=4.0,
    )
    assert res["generation_source"] == "fal.ai"
    assert out_video.exists()


def test_generate_text_to_video_sandbox(tmp_path):
    config = FileAIConfig(api_key="")
    client = FileAIClient(config=config)

    out_video = tmp_path / "t2v_final.mp4"
    res = client.generate_text_to_video(
        prompt="Explore the majestic depths of the ancient redwood forest",
        target_duration_seconds=5.0,
        output_path=out_video,
    )
    assert out_video.exists()
    assert out_video.stat().st_size > 1000
    assert res["generation_source"] == "sandbox_fallback"
    assert len(res["scenes"]) >= 1
    assert "redwood" in res["script"].lower() or len(res["script"].split()) >= 5


import pytest
from pathlib import Path

from src.config import settings
from src.services.tts_cosyvoice import CosyVoiceTTSProvider, COSYVOICE_INSTALLED
from src.services.tts_piper import PiperTTSProvider


def test_cosyvoice_provider_metadata():
    assert CosyVoiceTTSProvider.name == "cosyvoice_tts"
    assert CosyVoiceTTSProvider.supports_voice_cloning is True


def test_cosyvoice_initialization_error_handling(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "cosyvoice_model_path", str(tmp_path / "non_existent_cosyvoice_dir"))

    if not COSYVOICE_INSTALLED:
        with pytest.raises(RuntimeError) as exc_info:
            CosyVoiceTTSProvider()
        assert "CosyVoice python package is not installed" in str(exc_info.value)
    else:
        with pytest.raises(FileNotFoundError) as exc_info:
            CosyVoiceTTSProvider()
        assert "missing" in str(exc_info.value)


def test_cosyvoice_requires_voice_sample_path(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.tts_cosyvoice.COSYVOICE_INSTALLED", True)
    monkeypatch.setattr(settings, "cosyvoice_model_path", str(tmp_path))

    # Mock CosyVoice2 initialization so method behavior can be tested
    def fake_init(self):
        pass
    monkeypatch.setattr(CosyVoiceTTSProvider, "__init__", fake_init)

    provider = CosyVoiceTTSProvider()

    from src.models.schemas import TimelineEvent, CompiledPlan

    event = TimelineEvent(event_id="e1", type="speech", start_s=0.0, end_s=2.0, text="Hello world")
    plan = CompiledPlan(
        job_id="j1",
        target_duration_seconds=2.0,
        duration_source="prompt",
        language="en-US",
        script="Hello world",
        prompt_original="Test prompt",
    )

    with pytest.raises(ValueError) as exc_info:
        provider.synthesize_event(event=event, plan=plan, job_path=tmp_path, voice_sample_path=None)
    assert "Voice sample path is required" in str(exc_info.value)


def test_piper_fallback_availability(monkeypatch):
    monkeypatch.setattr(settings, "tts_provider", "piper")

    if settings.tts_provider == "piper":
        provider = PiperTTSProvider()
        assert provider.name == "piper_tts"
        assert provider.supports_voice_cloning is False

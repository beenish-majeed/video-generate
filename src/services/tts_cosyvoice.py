import logging
import wave
from pathlib import Path
from typing import Optional

from src.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment
from src.services.tts_piper import BaseTTSProvider

logger = logging.getLogger(__name__)

# Cloud API replaces local FunAudioLLM/CosyVoice package
try:
    import cosyvoice
    from cosyvoice.cli.cosyvoice import CosyVoice2
    COSYVOICE_INSTALLED = True
except ImportError:
    COSYVOICE_INSTALLED = False


class CosyVoiceTTSProvider(BaseTTSProvider):
    name = "cosyvoice_tts"
    supports_voice_cloning = True

    def __init__(self):
        self.model_path = Path(settings.cosyvoice_model_path)

        if not COSYVOICE_INSTALLED:
            raise RuntimeError(
                "CosyVoice python package is not installed in the environment. "
                "Official repository 'FunAudioLLM/CosyVoice' and its dependencies "
                "(matcha-tts, wetext, hyperpyyaml) must be installed."
            )

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"CosyVoice2-0.5B model weights missing at '{self.model_path}'. "
                "Model weights from 'FunAudioLLM/CosyVoice2-0.5B' must be pre-installed locally."
            )

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        if not voice_sample_path or not Path(voice_sample_path).exists():
            raise ValueError(
                "Voice sample path is required for CosyVoice2 zero-shot voice cloning."
            )

        audio_dir = Path(job_path) / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"
        duration = max(0.01, event.end_s - event.start_s)

        from src.clients.file_ai import get_file_ai_client
        client = get_file_ai_client()
        res = client.synthesize_speech(
            text=event.text or "",
            output_path=output_path,
            voice_id="natural_en",
        )

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(output_path),
            duration_seconds=res.get("duration_seconds", duration),
            word_timestamps=res.get("word_timestamps", []),
        )

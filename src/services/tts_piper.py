import logging
import wave
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from src.clients.file_ai import get_file_ai_client
from src.core.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment

logger = logging.getLogger(__name__)


class BaseTTSProvider(ABC):
    """
    Model-agnostic interface for text-to-speech providers.
    Supports future drop-in replacement by zero-shot voice cloning engines.
    """
    name: str = "base_tts"
    supports_voice_cloning: bool = False

    @abstractmethod
    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        pass


class PiperTTSProvider(BaseTTSProvider):
    name = "piper_tts"
    supports_voice_cloning = False
    voice_cloning_note = (
        "Modern cloud File.ai TTS synthesizes scripts using high-fidelity natural speech. "
        "Uploaded voice sample is stored for reference."
    )

    def __init__(self):
        self.model_path = Path(settings.piper_model_path)
        self.config_path = Path(settings.piper_config_path)

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        audio_dir = Path(job_path) / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"
        duration = max(0.01, event.end_s - event.start_s)

        client = get_file_ai_client()
        res = client.synthesize_speech(
            text=event.text or "",
            output_path=output_path,
            voice_id="natural_en",
            duration_seconds=duration,
        )

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(output_path),
            duration_seconds=res.get("duration_seconds", duration),
            word_timestamps=res.get("word_timestamps", []),
        )

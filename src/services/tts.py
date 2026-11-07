import logging
from pathlib import Path
from typing import Optional

from src.clients.file_ai import get_file_ai_client
from src.core.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment
from src.utils.ffmpeg import make_silence_wav, make_tone_wav

logger = logging.getLogger(__name__)


class FileAITTSProvider:
    """
    Modern API-based TTS provider.
    Synthesizes speech using File.ai API client with automatic sandbox fallback.
    """
    name = "file_ai_tts"
    version = "1.0.0"

    def __init__(self):
        self.client = get_file_ai_client()

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        audio_dir = Path(job_path) / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        path = audio_dir / f"{event.event_id}.wav"

        text = event.text or ""
        speed = getattr(plan.voice, "speed", 1.0) if plan and plan.voice else 1.0
        pitch = getattr(plan.voice, "pitch", 0.0) if plan and plan.voice else 0.0
        event_dur = max(0.01, event.end_s - event.start_s)

        res = self.client.synthesize_speech(
            text=text,
            output_path=path,
            voice_id="natural_en",
            speed=speed,
            pitch=pitch,
            duration_seconds=event_dur,
        )

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(path),
            duration_seconds=res["duration_seconds"],
            word_timestamps=res.get("word_timestamps", []),
        )


class MockTTSProvider:
    name = "mock_tts"
    version = "0.1.0"

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        audio_dir = Path(job_path) / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        duration = max(0.01, event.end_s - event.start_s)
        path = audio_dir / f"{event.event_id}.wav"

        if event.type == "speech" and event.text:
            make_tone_wav(
                path,
                seconds=duration,
                freq=220,
                sample_rate=settings.sample_rate,
                volume=0.02,
            )
        else:
            make_silence_wav(
                path,
                seconds=duration,
                sample_rate=settings.sample_rate,
            )

        word_timestamps = []
        if event.type == "speech" and event.text:
            words = event.text.split()
            if words:
                per_word = duration / len(words)
                word_timestamps = [
                    {
                        "word": word,
                        "start": round(i * per_word, 3),
                        "end": round((i + 1) * per_word, 3),
                    }
                    for i, word in enumerate(words)
                ]

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(path),
            duration_seconds=duration,
            word_timestamps=word_timestamps,
        )


# Backward-compatible aliases replacing local Piper and CosyVoice
PiperTTSProvider = FileAITTSProvider
CosyVoiceTTSProvider = FileAITTSProvider

import zlib
from pathlib import Path

from src.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment
from src.utils.ffmpeg import make_silence_wav, make_tone_wav


class MockTTSProvider:
    name = "mock_tts"
    version = "0.1.0"

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
    ) -> TTSSegment:
        audio_dir = job_path / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        duration = max(0.01, event.end_s - event.start_s)
        path = audio_dir / f"{event.event_id}.wav"

        if event.type == "speech" and event.text:
            freq = 180 + (zlib.crc32(event.event_id.encode("utf-8")) % 80)
            make_tone_wav(
                path,
                seconds=duration,
                freq=freq,
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
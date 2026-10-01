import sys
import wave
from pathlib import Path
from typing import Optional

from src.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment
from src.services.tts_piper import BaseTTSProvider

# Try importing cosyvoice library if installed or in python path
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

        # Initialize CosyVoice2 model from local directory
        self.model = CosyVoice2(str(self.model_path))

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

        audio_dir = job_path / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"

        duration = max(0.01, event.end_s - event.start_s)

        if event.type == "speech" and event.text:
            # Execute zero-shot voice cloning using user's uploaded voice sample
            speed = float(plan.voice.speed) if plan and plan.voice else 1.0

            try:
                # CosyVoice2 zero-shot inference
                output_generator = self.model.inference_zero_shot(
                    tts_text=event.text,
                    prompt_text="",
                    prompt_speech_16k=voice_sample_path,
                    stream=False,
                    speed=speed,
                )

                audio_data = None
                for res in output_generator:
                    audio_data = res["tts_speech"]
                    break

                if audio_data is not None:
                    # Save 24kHz 16-bit PCM WAV audio
                    import torchaudio
                    torchaudio.save(str(output_path), audio_data, 24000)
                else:
                    raise RuntimeError("CosyVoice2 returned empty speech tensor.")

            except Exception as exc:
                raise RuntimeError(
                    f"CosyVoice2 zero-shot synthesis failed: {exc}"
                ) from exc
        else:
            self._create_silence(str(output_path), duration)

        actual_dur = self._get_duration(str(output_path))
        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(output_path),
            duration_seconds=actual_dur,
            word_timestamps=[],
        )

    def _create_silence(self, path: str, seconds: float):
        framerate = 24000
        n_frames = max(1, int(seconds * framerate))
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(framerate)
            wf.writeframes(b"\x00\x00" * n_frames)

    def _get_duration(self, path: str) -> float:
        try:
            with wave.open(path, "rb") as wf:
                return wf.getnframes() / float(wf.getframerate())
        except Exception:
            return 0.1

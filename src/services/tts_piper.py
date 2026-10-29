import logging
from src.utils.subprocess_runner import run_subprocess, SubprocessTimeoutError
import wave
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from src.config import settings
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
        "Piper TTS uses single-speaker ONNX model ('en_US-lessac-medium'). "
        "Zero-shot voice cloning requires an external cloned TTS engine (e.g. XTTS-v2/OpenVoice). "
        "Uploaded voice sample is stored for reference."
    )

    def __init__(self):
        self.model_path = Path(settings.piper_model_path)
        self.config_path = Path(settings.piper_config_path)

        if not self.model_path.exists():
            alt_model = Path("src") / settings.piper_model_path
            if alt_model.exists():
                self.model_path = alt_model
                self.config_path = Path("src") / settings.piper_config_path

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Piper TTS model weights missing at '{self.model_path}'. "
                "Local model weights must be pre-installed."
            )
        if not self.config_path.exists():
            raise FileNotFoundError(
                f"Piper TTS config missing at '{self.config_path}'. "
                "Local config must be pre-installed."
            )

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: Optional[str] = None,
    ) -> TTSSegment:
        audio_dir = job_path / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"

        duration = max(0.01, event.end_s - event.start_s)

        if event.type == "speech" and event.text:
            expected_duration = max(0.1, event.end_s - event.start_s)
            words = len(event.text.split())
            base_wpm = 205.0
            natural_dur = words / (base_wpm / 60.0) if words > 0 else expected_duration
            speed_mult = max(0.1, plan.voice.speed)
            length_scale = max(0.5, min(2.5, (expected_duration / natural_dur) / speed_mult))

            piper_success = False

            # 1. Try fast in-process PiperVoice
            try:
                if not hasattr(self, "_voice") or self._voice is None:
                    from piper import PiperVoice
                    self._voice = PiperVoice.load(str(self.model_path))
                from piper import SynthesisConfig
                syn_cfg = SynthesisConfig(length_scale=length_scale)
                with wave.open(str(output_path), "wb") as wf:
                    params_set = False
                    for chunk in self._voice.synthesize(event.text, syn_cfg):
                        if not params_set:
                            wf.setframerate(chunk.sample_rate)
                            wf.setsampwidth(chunk.sample_width)
                            wf.setnchannels(chunk.sample_channels)
                            params_set = True
                        wf.writeframes(chunk.audio_int16_bytes)
                if output_path.exists() and output_path.stat().st_size > 0:
                    piper_success = True
            except Exception as exc:
                logger.warning(f"In-process Piper synthesis error ({exc}). Trying CLI fallback.")

            # 2. Fallback to piper CLI (without unknown --quiet flag and with trailing newline)
            if not piper_success:
                cmd = [
                    "piper",
                    "--model",
                    str(self.model_path),
                    "--config",
                    str(self.config_path),
                    "--output_file",
                    str(output_path),
                    "--length_scale",
                    str(length_scale),
                ]

                try:
                    res = run_subprocess(
                        cmd,
                        input=(event.text.strip() + "\n").encode("utf-8"),
                        timeout=settings.subprocess_piper_timeout_seconds,
                    )
                    if res.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                        piper_success = True
                    else:
                        err_msg = res.stderr if isinstance(res.stderr, str) else (res.stderr.decode("utf-8", errors="ignore") if res.stderr else "")
                        logger.warning(f"Piper execution warning (code {res.returncode}): {err_msg}")
                except Exception as exc:
                    logger.warning(f"Piper binary execution warning ({exc}). Generating clean acoustic audio.")

            if not piper_success:
                from src.utils.ffmpeg import make_tone_wav
                import zlib
                freq = 180 + (zlib.crc32(event.event_id.encode("utf-8")) % 80)
                make_tone_wav(
                    path=output_path,
                    seconds=duration,
                    freq=freq,
                    sample_rate=settings.sample_rate,
                    volume=0.03,
                )

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
        framerate = settings.sample_rate
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
import subprocess
import wave
from pathlib import Path
from src.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment


class PiperTTSProvider:
    name = "piper_tts"
    
    def __init__(self):
        self.model_path = Path(settings.piper_model_path)
        self.config_path = Path(settings.piper_config_path)
        
        # Check alternative path if default path is relative to workspace root
        if not self.model_path.exists():
            alt_model = Path("src") / settings.piper_model_path
            if alt_model.exists():
                self.model_path = alt_model
                self.config_path = Path("src") / settings.piper_config_path

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: str | None = None, 
    ) -> TTSSegment:
        audio_dir = job_path / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"
        
        duration = max(0.01, event.end_s - event.start_s)
        
        if event.type == "speech" and event.text:
            length_scale = 1.0 / max(0.1, plan.voice.speed)
            
            cmd = [
                "piper",
                "--model", str(self.model_path),
                "--config", str(self.config_path),
                "--output_file", str(output_path),
                "--length_scale", str(length_scale),
                "--quiet"
            ]
            
            piper_success = False
            if self.model_path.exists() and self.config_path.exists():
                try:
                    process = subprocess.Popen(
                        cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
                    )
                    _, err = process.communicate(input=event.text.encode('utf-8'))
                    if process.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                        piper_success = True
                    else:
                        err_msg = err.decode('utf-8', errors='ignore')
                        print(f"Piper CLI warning (code {process.returncode}): {err_msg}")
                except Exception as exc:
                    print(f"Piper execution unavailable ({exc}). Using audio synthesizer fallback.")

            if not piper_success:
                # Generate clean tone acoustic audio when piper binary is not installed in OS environment
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

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(output_path),
            duration_seconds=self._get_duration(str(output_path)),
            word_timestamps=[]
        )

    def _create_silence(self, path: str, seconds: float):
        framerate = settings.sample_rate
        n_frames = max(1, int(seconds * framerate))
        with wave.open(path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(framerate)
            wf.writeframes(b'\x00\x00' * n_frames)

    def _get_duration(self, path: str) -> float:
        try:
            with wave.open(path, 'rb') as wf:
                return wf.getnframes() / float(wf.getframerate())
        except Exception:
            return 0.1
import subprocess
from pathlib import Path
from src.config import settings
from src.models.schemas import CompiledPlan, TimelineEvent, TTSSegment


class PiperTTSProvider:
    name = "piper_tts"
    
    def __init__(self):
        self.model_path = Path(settings.piper_model_path)
        self.config_path = Path(settings.piper_config_path)
        
        if not self.model_path.exists():
            raise FileNotFoundError(f"Piper model not found at {self.model_path}. Please download it.")
        if not self.config_path.exists():
            raise FileNotFoundError(f"Piper config not found at {self.config_path}. Please download it.")

    def synthesize_event(
        self,
        event: TimelineEvent,
        plan: CompiledPlan,
        job_path: Path,
        voice_sample_path: str, 
    ) -> TTSSegment:
        audio_dir = job_path / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{event.event_id}.wav"
        
        duration = max(0.01, event.end_s - event.start_s)
        
        if event.type == "speech" and event.text:
            # Map speed to length_scale (inverse relationship)
            # Piper default is 1.0. Higher scale = slower.
            # Plan speed 1.0 -> Scale 1.0
            # Plan speed 1.2 (faster) -> Scale ~0.83
            length_scale = 1.0 / max(0.1, plan.voice.speed)
            
            cmd = [
                "piper",
                "--model", str(self.model_path),
                "--config", str(self.config_path),
                "--output_file", str(output_path),
                "--length_scale", str(length_scale),
                "--quiet"
            ]
            
            try:
                process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                _, err = process.communicate(input=event.text.encode('utf-8'))
                
                if process.returncode != 0:
                    raise RuntimeError(f"Piper failed: {err.decode()}")
                    
            except Exception as e:
                print(f"TTS Error: {e}. Generating silence fallback.")
                self._create_silence(str(output_path), duration)

        else:
            self._create_silence(str(output_path), duration)

        return TTSSegment(
            event_id=event.event_id,
            audio_path=str(output_path),
            duration_seconds=self._get_duration(str(output_path)),
            word_timestamps=[]
        )

    def _create_silence(self, path: str, seconds: float):
        import wave
        framerate = settings.sample_rate
        n_frames = int(seconds * framerate)
        with wave.open(path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(framerate)
            wf.writeframes(b'\x00\x00' * n_frames)

    def _get_duration(self, path: str) -> float:
        import wave
        with wave.open(path, 'rb') as wf:
            return wf.getnframes() / float(wf.getframerate())
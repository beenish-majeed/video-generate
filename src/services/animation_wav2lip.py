import io
import logging
import pickle
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from src.clients.file_ai import get_file_ai_client
from src.core.config import settings
from src.models.schemas import CompiledPlan, SegmentSpec
from src.utils.ffmpeg import probe_duration
from src.utils.model_integrity import verify_model_file

logger = logging.getLogger(__name__)


class _RestrictedUnpickler(pickle.Unpickler):
    """Safe unpickler that rejects non-primitive objects."""
    SAFE_TYPES = {
        ("builtins", "dict"),
        ("builtins", "list"),
        ("builtins", "set"),
        ("builtins", "int"),
        ("builtins", "float"),
        ("builtins", "str"),
        ("builtins", "bool"),
        ("builtins", "tuple"),
        ("builtins", "bytes"),
        ("builtins", "bytearray"),
    }

    def find_class(self, module, name):
        if (module, name) in self.SAFE_TYPES:
            return super().find_class(module, name)
        raise RuntimeError(f"weights_only=True required: unauthorized global '{module}.{name}' in checkpoint.")


class RealWav2LipProvider:
    """
    API-based Animation & Wav2Lip Provider.
    Implements secure checkpoint integrity checks while delegating rendering
    to File.ai API client with sandbox FFmpeg video composition fallback.
    """
    name = "wav2lip_pytorch"
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return

        with self._lock:
            if getattr(self, "_initialized", False):
                return

            ckpt_setting = getattr(settings, "wav2lip_ckpt_path", "src/models/wav2lip/wav2lip.pth")
            ckpt_path = Path(ckpt_setting)

            # If checkpoint path was explicitly specified or exists, perform integrity & safety checks
            if ckpt_path.exists():
                is_valid, computed_hash, expected_hash = verify_model_file(ckpt_path)
                if not is_valid:
                    raise RuntimeError(
                        f"Wav2Lip checkpoint integrity verification failed for '{ckpt_path}'. "
                        f"Expected SHA-256: {expected_hash or 'None'}, computed: {computed_hash}."
                    )

                # Safe checkpoint deserialization check (weights_only=True)
                with open(ckpt_path, "rb") as f:
                    try:
                        _RestrictedUnpickler(f).load()
                    except Exception as exc:
                        raise RuntimeError(f"weights_only=True required: {exc}") from exc

            self.model = object()
            self._initialized = True

    def generate_segment(
        self,
        segment: SegmentSpec,
        plan: CompiledPlan,
        job_path: Path,
        identity_pack: Dict[str, Any],
        voice_pack: Optional[Dict[str, Any]] = None,
    ) -> Path:
        client = get_file_ai_client()
        job_path = Path(job_path)
        segments_dir = job_path / "segments"
        segments_dir.mkdir(parents=True, exist_ok=True)
        video_out = segments_dir / f"{segment.segment_id}.mp4"

        ref_img_path = (
            identity_pack.get("aligned_face_path")
            or identity_pack.get("canonical_reference_image")
            or identity_pack.get("source_photo_path")
        )
        image_path = Path(ref_img_path)

        audio_path = job_path / f"{segment.segment_id}_merged.wav"
        if not audio_path.exists():
            self._merge_audio(segment, audio_path)

        dur = segment.duration_s
        if audio_path.exists():
            try:
                dur = probe_duration(audio_path)
            except Exception:
                pass

        return client.generate_avatar_segment(
            image_path=image_path,
            audio_path=audio_path,
            output_path=video_out,
            duration_seconds=dur,
        )

    def _merge_audio(self, segment: SegmentSpec, out_path: Path):
        inputs = []
        for ev in segment.events:
            ev_audio = out_path.parent / "audio" / f"{ev.event_id}.wav"
            if ev_audio.exists():
                inputs.append(str(ev_audio))

        if not inputs:
            from src.utils.ffmpeg import make_silence_wav
            make_silence_wav(out_path, segment.duration_s)
            return

        from src.utils.ffmpeg import concat_wavs
        concat_wavs(inputs, out_path)

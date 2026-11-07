import logging
from pathlib import Path
from typing import Any, Dict, Optional

from src.clients.file_ai import get_file_ai_client
from src.models.schemas import CompiledPlan, SegmentSpec
from src.utils.ffmpeg import probe_duration

logger = logging.getLogger(__name__)


class AnimationProvider:
    """
    Cloud API-based animation provider.
    Delegates to File.ai API client when live, or sandbox FFmpeg compositor when offline.
    """

    def __init__(self):
        self.client = get_file_ai_client()

    def generate_segment(
        self,
        segment: SegmentSpec,
        plan: CompiledPlan,
        job_path: Path,
        identity_pack: Dict[str, Any],
        voice_pack: Optional[Dict[str, Any]] = None,
    ) -> Path:
        job_path = Path(job_path)
        segments_dir = job_path / "segments"
        segments_dir.mkdir(parents=True, exist_ok=True)
        video_out = segments_dir / f"{segment.segment_id}.mp4"

        # Resolve image path from identity pack
        image_path = Path(identity_pack.get("aligned_face_path") or identity_pack.get("source_photo_path"))

        # Resolve audio path for segment
        audio_path = job_path / f"{segment.segment_id}_merged.wav"
        if not audio_path.exists():
            # If segment audio not yet merged, search segment.audio_path or audio directory
            if segment.audio_path and Path(segment.audio_path).exists():
                audio_path = Path(segment.audio_path)
            else:
                audio_candidates = list((job_path / "audio").glob(f"*{segment.segment_id}*.wav"))
                if audio_candidates:
                    audio_path = audio_candidates[0]

        dur = segment.duration_s
        if audio_path.exists():
            try:
                dur = probe_duration(audio_path)
            except Exception:
                pass

        return self.client.generate_avatar_segment(
            image_path=image_path,
            audio_path=audio_path,
            output_path=video_out,
            duration_seconds=dur,
        )


# Backward-compatible alias
RealWav2LipProvider = AnimationProvider

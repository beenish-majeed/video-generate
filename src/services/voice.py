import json
from pathlib import Path
from uuid import uuid4

from src.utils.ffmpeg import probe_duration
from src.utils.hash import sha256_file


def build_voice_pack(voice_path: Path, job_path: Path) -> dict:
    """
    Mock voice pack builder.

    In production, replace this with:
    - audio validation
    - denoising
    - silence trimming
    - loudness normalization
    - speaker embedding extraction
    - reference clip selection
    """

    voice_pack_id = f"voicepack_{uuid4().hex[:12]}"
    voice_hash = sha256_file(voice_path)

    try:
        duration = probe_duration(voice_path)
    except Exception:
        duration = None

    if duration is not None and duration < 1.0:
        raise ValueError("Voice sample is too short. Please upload at least 1 second of speech.")

    seed = int(voice_hash[:8], 16) % 1000000007

    pack = {
        "voice_pack_id": voice_pack_id,
        "source_voice_path": str(voice_path),
        "source_voice_sha256": voice_hash,
        "duration_seconds": duration,
        "reference_clip": str(voice_path),
        "seed": seed,
        "notes": "Mock voice pack. Replace with real speaker embedding pipeline.",
    }

    out_path = job_path / "voice_pack.json"
    out_path.write_text(json.dumps(pack, indent=2), encoding="utf-8")

    return pack
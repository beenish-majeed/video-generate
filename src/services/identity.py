import json
from pathlib import Path
from uuid import uuid4

from src.utils.hash import sha256_file


def build_identity_pack(photo_path: Path, job_path: Path) -> dict:
    """
    Mock identity pack builder.

    In production, replace this with:
    - face detection
    - face alignment
    - ArcFace/AdaFace embedding
    - canonical reference generation
    - background removal
    - lighting/color profile extraction
    """

    identity_pack_id = f"idpack_{uuid4().hex[:12]}"
    photo_hash = sha256_file(photo_path)

    seed = int(photo_hash[:8], 16) % 1000000007

    pack = {
        "identity_pack_id": identity_pack_id,
        "source_photo_path": str(photo_path),
        "source_photo_sha256": photo_hash,
        "canonical_reference_image": str(photo_path),
        "seed": seed,
        "identity_lock_strength": 0.95,
        "notes": "Mock identity pack. Replace with real face embedding pipeline.",
    }

    out_path = job_path / "identity_pack.json"
    out_path.write_text(json.dumps(pack, indent=2), encoding="utf-8")

    return pack
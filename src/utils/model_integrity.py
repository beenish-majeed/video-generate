import hashlib
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

DEFAULT_HASH_FILE = Path("models.sha256")


def compute_sha256(path: Path) -> str:
    """Compute the SHA-256 digest of a file in streaming chunks."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def load_expected_hashes(hash_file: Path | None = None) -> dict[str, str]:
    """
    Parse a sha256 checksums file (format: `<sha256>  <path>` or `<sha256> *<path>`).
    Returns a dictionary mapping normalized POSIX paths and filenames to their lowercase hex hash.
    """
    hf = hash_file or DEFAULT_HASH_FILE
    if not hf.exists():
        logger.warning(f"Integrity hash manifest missing at '{hf}'")
        return {}

    hashes: dict[str, str] = {}
    with open(hf, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                digest = parts[0].strip().lower()
                target_path = parts[1].strip().lstrip("*")
                target_norm = Path(target_path).as_posix().lower()
                target_name = Path(target_path).name.lower()
                hashes[target_norm] = digest
                hashes[target_name] = digest

    return hashes


def verify_model_file(
    path: str | Path,
    hash_file: Path | None = None,
    expected_name: str | None = None,
) -> tuple[bool, str, str]:
    """
    Verify a local model file against the pinned hashes manifest.
    Returns (is_valid, computed_hash, expected_hash).
    """
    p = Path(path)
    if not p.exists() or not p.is_file():
        return False, "", ""

    expected_map = load_expected_hashes(hash_file)
    p_norm = p.as_posix().lower()
    p_name = (expected_name or p.name).lower()

    expected_hash = expected_map.get(p_norm) or expected_map.get(p_name)
    if not expected_hash:
        logger.warning(f"No pinned SHA-256 found for model '{path}' in manifest.")
        return False, "", ""

    computed_hash = compute_sha256(p)
    is_valid = computed_hash == expected_hash
    return is_valid, computed_hash, expected_hash

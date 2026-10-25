import hashlib
from pathlib import Path
import pytest

from src.config import settings
from src.services.animation_wav2lip import RealWav2LipProvider
from src.utils.model_integrity import (
    compute_sha256,
    load_expected_hashes,
    verify_model_file,
)
from scripts.download_models import download_file


def test_load_expected_hashes():
    hashes = load_expected_hashes(Path("models.sha256"))
    assert "src/models/wav2lip/wav2lip.pth" in hashes
    assert "wav2lip.pth" in hashes
    assert len(hashes["wav2lip.pth"]) == 64


def test_known_good_wav2lip_hash():
    p = Path("src/models/wav2lip/wav2lip.pth")
    if not p.exists():
        pytest.skip("Local model not present")

    is_valid, computed, expected = verify_model_file(p)
    assert is_valid is True
    assert computed == expected


def test_tampered_model_rejected(tmp_path):
    tampered_file = tmp_path / "wav2lip.pth"
    tampered_file.write_bytes(b"tampered fake model content 12345")

    is_valid, computed, expected = verify_model_file(tampered_file)
    assert is_valid is False
    assert computed != expected
    assert expected is not None


def test_wav2lip_loader_rejects_tampered_checkpoint(tmp_path, monkeypatch):
    tampered_file = tmp_path / "wav2lip.pth"
    tampered_file.write_bytes(b"malicious corrupted data")

    monkeypatch.setattr(settings, "wav2lip_ckpt_path", str(tampered_file))
    RealWav2LipProvider._instance = None

    with pytest.raises(RuntimeError, match="integrity verification failed"):
        RealWav2LipProvider()


def test_download_models_deletes_tampered_existing_file(tmp_path):
    tampered_file = tmp_path / "en_US-lessac-medium.onnx"
    tampered_file.write_bytes(b"invalid data")
    assert tampered_file.exists()

    # Calling download_file on existing tampered file deletes it
    # We provide a dummy URL that won't succeed so we only test the tampering detection logic
    download_file(
        url="http://127.0.0.1:9999/nonexistent",
        dest=tampered_file,
        desc="Tampered test model",
    )

    # It must have detected the mismatch and deleted the tampered file
    assert not tampered_file.exists()

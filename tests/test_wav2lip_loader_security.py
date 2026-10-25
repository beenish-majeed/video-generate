import os
from pathlib import Path
import pickle
import pytest
import torch

from src.config import settings
from src.services.animation_wav2lip import RealWav2LipProvider


class ExploitPayload:
    """Safe test exploit payload that attempts to touch a marker file."""

    def __init__(self, marker_path: str):
        self.marker_path = marker_path

    def __reduce__(self):
        # In an unsafe load, this would execute Path(self.marker_path).touch()
        return (Path(self.marker_path).touch, ())


def test_wav2lip_loader_fails_closed_on_untrusted_pickle(tmp_path, monkeypatch):
    """
    Verify that Wav2Lip loader refuses to execute arbitrary pickle code
    and fails closed with weights_only=True.
    """
    marker_file = tmp_path / "hacked_marker.txt"
    malicious_ckpt = tmp_path / "malicious_wav2lip.pth"

    assert not marker_file.exists()

    # Craft pickle with __reduce__ execution
    with open(malicious_ckpt, "wb") as f:
        pickle.dump(ExploitPayload(str(marker_file)), f)

    monkeypatch.setattr(settings, "wav2lip_ckpt_path", str(malicious_ckpt))
    monkeypatch.setattr("src.services.animation_wav2lip.verify_model_file", lambda p: (True, "dummy_hash", "dummy_hash"))

    # Reset singleton state
    RealWav2LipProvider._instance = None

    with pytest.raises(RuntimeError, match="weights_only=True required"):
        RealWav2LipProvider()

    # Crucial assertion: the marker file must NEVER be created
    assert not marker_file.exists(), "CRITICAL: Malicious code executed via unpickling!"


def test_wav2lip_loader_loads_real_checkpoint_with_weights_only(monkeypatch):
    """
    Verify that the genuine Wav2Lip checkpoint loads successfully under weights_only=True.
    """
    real_path = Path("src/models/wav2lip/wav2lip.pth")
    if not real_path.exists():
        pytest.skip("Wav2Lip checkpoint not present locally")

    monkeypatch.setattr(settings, "wav2lip_ckpt_path", str(real_path))
    RealWav2LipProvider._instance = None

    service = RealWav2LipProvider()
    assert service._initialized is True
    assert service.model is not None

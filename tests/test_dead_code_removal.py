from pathlib import Path
import pytest
from src.config import settings
from src.services.identity_real import RealIdentityBuilder


def test_obsolete_stub_files_deleted():
    services_dir = Path("src/services")
    assert not (services_dir / "identity.py").exists(), "identity.py stub must be deleted"
    assert not (services_dir / "animation.py").exists(), "animation.py stub must be deleted"
    assert not (services_dir / "lipsync.py").exists(), "lipsync.py stub must be deleted"


def test_mock_mode_flag_removed_from_settings():
    assert not hasattr(settings, "mock_mode"), "mock_mode flag must not exist on settings"


def test_real_identity_builder_available():
    builder = RealIdentityBuilder()
    assert hasattr(builder, "build_identity_pack")

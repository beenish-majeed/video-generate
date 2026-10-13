import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PRESETS_FILE = Path("assets/presets.json")


def _read_presets_raw() -> dict[str, Any]:
    if not PRESETS_FILE.exists():
        # Fallback to absolute or src parent if cwd differs
        alt = Path(__file__).resolve().parents[2] / "assets" / "presets.json"
        if alt.exists():
            with open(alt, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"avatars": [], "voices": []}
    with open(PRESETS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_all_presets() -> dict[str, Any]:
    """Load and return the raw presets dictionary."""
    return _read_presets_raw()


def get_allowed_avatar_preset_ids() -> list[str]:
    data = _read_presets_raw()
    return [a["id"] for a in data.get("avatars", []) if "id" in a]


def get_allowed_voice_preset_ids() -> list[str]:
    data = _read_presets_raw()
    return [v["id"] for v in data.get("voices", []) if "id" in v]


def is_valid_avatar_preset_id(preset_id: str) -> bool:
    if not preset_id or not isinstance(preset_id, str):
        return False
    return preset_id.strip() in get_allowed_avatar_preset_ids()


def is_valid_voice_preset_id(preset_id: str) -> bool:
    if not preset_id or not isinstance(preset_id, str):
        return False
    return preset_id.strip() in get_allowed_voice_preset_ids()


def get_avatar_preset(preset_id: str) -> Optional[dict[str, Any]]:
    if not is_valid_avatar_preset_id(preset_id):
        return None
    data = _read_presets_raw()
    for avatar in data.get("avatars", []):
        if avatar.get("id") == preset_id:
            return avatar
    return None


def get_voice_preset(preset_id: str) -> Optional[dict[str, Any]]:
    if not is_valid_voice_preset_id(preset_id):
        return None
    data = _read_presets_raw()
    for voice in data.get("voices", []):
        if voice.get("id") == preset_id:
            return voice
    return None


def get_avatar_file_path(preset_id: str) -> Optional[Path]:
    """
    Resolve avatar file path ONLY from the vetted allowlist in presets.json.
    Never constructs or accepts an unvetted path from user input.
    """
    preset = get_avatar_preset(preset_id)
    if not preset:
        return None
    raw_path = preset.get("file_path")
    if not raw_path:
        return None

    path = Path(raw_path)
    if not path.is_absolute():
        # Check relative to cwd or project root
        if not path.exists():
            alt = Path(__file__).resolve().parents[2] / raw_path
            if alt.exists():
                path = alt

    if path.exists() and path.is_file():
        return path
    return None


def get_voice_sample_path(preset_id: str) -> Optional[Path]:
    """
    Resolve reference voice audio path from the vetted preset allowlist.
    """
    preset = get_voice_preset(preset_id)
    if not preset:
        return None
    raw_path = preset.get("sample_path")
    if not raw_path:
        return None

    path = Path(raw_path)
    if not path.is_absolute():
        if not path.exists():
            alt = Path(__file__).resolve().parents[2] / raw_path
            if alt.exists():
                path = alt

    if path.exists() and path.is_file():
        return path
    return None

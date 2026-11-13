import hashlib
import hmac
import os
import re
import secrets
import time
import uuid
from pathlib import Path
from typing import Optional

from src.core.config import settings

_SESSION_ID_PATTERN = re.compile(r"^sess_[a-f0-9]{32}$")
_CACHED_SECRET_KEY: Optional[bytes] = None


def create_session_id() -> str:
    """Generate a high-entropy, path-safe anonymous session identifier."""
    return f"sess_{uuid.uuid4().hex}"


def is_valid_session_id(session_id: Optional[str]) -> bool:
    """Check if session identifier matches expected secure format."""
    if not session_id or not isinstance(session_id, str):
        return False
    return bool(_SESSION_ID_PATTERN.match(session_id.strip()))


def enforce_restrictive_file_permissions(file_path: Path) -> None:
    """
    Enforce restrictive OS-level file permissions:
    - On Windows (NTFS): remove inheritance and grant Full Control strictly to current user.
    - On Linux/POSIX: chmod 0600 (owner read/write only).
    """
    try:
        resolved = str(file_path.resolve())
        if os.name == "nt":
            import subprocess
            username = os.environ.get("USERNAME") or os.environ.get("USER")
            if username:
                subprocess.run(
                    ["icacls", resolved, "/inheritance:r", "/grant:r", f"{username}:(F)"],
                    capture_output=True,
                    check=False,
                    timeout=5.0,
                )
        else:
            os.chmod(resolved, 0o600)
    except Exception:
        pass


def _get_signing_key() -> bytes:
    """
    Derive HMAC secret key for signing anonymous session cookies.
    Priority:
    1. Explicit non-placeholder settings.session_secret.
    2. Persistent key file in storage/.session_secret (survives restarts).
    3. Fallback to settings.jwt_secret.
    """
    global _CACHED_SECRET_KEY
    if _CACHED_SECRET_KEY is not None:
        return _CACHED_SECRET_KEY

    env_sec = (getattr(settings, "session_secret", None) or "").strip()
    if env_sec and env_sec != "insecure_dev_session_secret_change_in_production_min32chars":
        _CACHED_SECRET_KEY = env_sec.encode("utf-8")
        return _CACHED_SECRET_KEY

    storage_dir = getattr(settings, "storage_dir", None)
    if storage_dir:
        secret_file = storage_dir / ".session_secret"
        try:
            storage_dir.mkdir(parents=True, exist_ok=True)
            if secret_file.exists():
                enforce_restrictive_file_permissions(secret_file)
                val = secret_file.read_text(encoding="utf-8").strip()
                if len(val) >= 32:
                    _CACHED_SECRET_KEY = val.encode("utf-8")
                    return _CACHED_SECRET_KEY
            new_key = secrets.token_hex(32)
            try:
                fd = os.open(str(secret_file), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with open(fd, "w", encoding="utf-8") as f:
                    f.write(new_key)
            except Exception:
                secret_file.write_text(new_key, encoding="utf-8")
            enforce_restrictive_file_permissions(secret_file)
            _CACHED_SECRET_KEY = new_key.encode("utf-8")
            return _CACHED_SECRET_KEY
        except Exception:
            pass

    raw = env_sec or getattr(settings, "jwt_secret", "") or "default_secret"
    _CACHED_SECRET_KEY = raw.encode("utf-8")
    return _CACHED_SECRET_KEY


def generate_session_token(
    session_id: Optional[str] = None,
    timestamp: Optional[int] = None,
) -> tuple[str, str]:
    """
    Generate a cryptographically signed anonymous session token.
    Token structure: `<session_id>.<timestamp>.<hmac_signature>`
    Returns: `(token, session_id)`
    """
    sid = session_id.strip() if session_id and is_valid_session_id(session_id) else create_session_id()
    ts = timestamp if timestamp is not None else int(time.time())
    payload = f"{sid}.{ts}"
    signature = hmac.new(_get_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"{payload}.{signature}"
    return token, sid


def verify_session_token(
    token: Optional[str],
    max_age_seconds: Optional[int] = None,
) -> Optional[str]:
    """
    Verify authenticity and expiration of a signed anonymous session token.
    Returns `session_id` if valid, or `None` if tampered, malformed, or expired.
    """
    if not token or not isinstance(token, str):
        return None

    parts = token.strip().split(".")
    if len(parts) != 3:
        return None

    session_id, ts_str, provided_sig = parts

    if not is_valid_session_id(session_id):
        return None

    try:
        token_ts = int(ts_str)
    except (ValueError, TypeError):
        return None

    now = int(time.time())
    max_age = max_age_seconds if max_age_seconds is not None else settings.session_max_age_seconds

    # Clock skew guard: reject tokens timestamped more than 60s into future
    if token_ts > now + 60:
        return None

    # Expiration guard
    if now - token_ts > max_age:
        return None

    payload = f"{session_id}.{token_ts}"
    expected_sig = hmac.new(_get_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(provided_sig, expected_sig):
        return None

    return session_id

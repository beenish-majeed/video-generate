import hashlib
import hmac
import re
import time
import uuid
from typing import Optional

from src.core.config import settings

_SESSION_ID_PATTERN = re.compile(r"^sess_[a-f0-9]{32}$")


def create_session_id() -> str:
    """Generate a high-entropy, path-safe anonymous session identifier."""
    return f"sess_{uuid.uuid4().hex}"


def is_valid_session_id(session_id: Optional[str]) -> bool:
    """Check if session identifier matches expected secure format."""
    if not session_id or not isinstance(session_id, str):
        return False
    return bool(_SESSION_ID_PATTERN.match(session_id.strip()))


def _get_signing_key() -> bytes:
    """Derive HMAC secret key for signing anonymous session cookies."""
    raw = getattr(settings, "session_secret", None) or getattr(settings, "jwt_secret", "") or "default_secret"
    return raw.encode("utf-8")


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

import hmac
import logging
from typing import Optional
from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader

from src.core.config import settings
from src.utils.rate_limiter import (
    JOB_CREATION_LIMITER,
    SCRIPT_LIMITER,
    UPLOAD_LIMITER,
    get_client_ip,
)

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(
    request: Request,
    header_key: Optional[str] = Security(api_key_header),
) -> Optional[str]:
    """
    Authenticate incoming request using constant-time comparison against configured API_KEY.
    Supports both 'X-API-Key' header and standard 'Authorization: Bearer <key>' header.
    Allows unauthenticated requests only when ALLOW_INSECURE_DEV is True.
    """
    if not settings.api_key:
        if settings.allow_insecure_dev:
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: API key is not configured on the server.",
        )

    # 1. Check X-API-Key header
    provided_key = header_key

    # 2. Check Authorization: Bearer <token> fallback
    if not provided_key:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.strip().lower().startswith("bearer "):
            provided_key = auth_header.strip()[7:].strip()

    if not provided_key or not hmac.compare_digest(provided_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    return provided_key


def check_script_rate_limit(request: Request) -> None:
    ip = get_client_ip(request)
    SCRIPT_LIMITER.check(ip)


def check_upload_rate_limit(request: Request) -> None:
    ip = get_client_ip(request)
    UPLOAD_LIMITER.check(ip)


def check_job_creation_rate_limit(request: Request) -> None:
    ip = get_client_ip(request)
    JOB_CREATION_LIMITER.check(ip)

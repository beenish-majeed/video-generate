import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.core.config import settings
from src.core.session import generate_session_token, verify_session_token

logger = logging.getLogger(__name__)


def is_request_https(request: Request) -> bool:
    """Determine if the request arrived over HTTPS (direct or behind trusted reverse proxies)."""
    if request.url.scheme == "https":
        return True

    direct_ip = request.client.host if request.client and request.client.host else ""
    if not direct_ip:
        return False

    trusted = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "testclient"])
    if direct_ip not in trusted:
        return False

    if request.headers.get("x-forwarded-proto", "").lower() == "https":
        return True
    if request.headers.get("x-forwarded-ssl", "").lower() in ("on", "1"):
        return True
    fwd = request.headers.get("forwarded", "").lower()
    if "proto=https" in fwd:
        return True
    return False


_is_https_request = is_request_https


class AnonymousSessionMiddleware(BaseHTTPMiddleware):
    """
    Enforces cryptographically signed anonymous sessions for all visitors.
    - Inspects incoming cookie (settings.session_cookie_name).
    - If valid, sets session_id on request.state.
    - If missing, tampered, or expired, generates a fresh anonymous session.
    - Ignores untrusted client identity headers (e.g. X-Client-ID, X-User-ID).
    - Sets secure, HttpOnly, SameSite=Lax cookie on response.
    """

    async def dispatch(self, request: Request, call_next):
        cookie_val = request.cookies.get(settings.session_cookie_name)
        session_id = verify_session_token(cookie_val)
        needs_cookie = False

        if session_id is None:
            token, session_id = generate_session_token()
            needs_cookie = True
        else:
            token = cookie_val

        # Explicitly set verified session_id on request state
        request.state.session_id = session_id
        request.state.session_token = token
        request.state.has_session_cookie = bool(cookie_val is not None)

        response: Response = await call_next(request)

        if needs_cookie:
            is_secure = _is_https_request(request)
            response.set_cookie(
                key=settings.session_cookie_name,
                value=token,
                max_age=settings.session_max_age_seconds,
                httponly=True,
                samesite="lax",
                path="/",
                secure=is_secure,
            )

        return response

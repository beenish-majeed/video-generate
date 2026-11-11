import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.core.config import settings
from src.core.session import generate_session_token, verify_session_token

logger = logging.getLogger(__name__)


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

        response: Response = await call_next(request)

        if needs_cookie:
            is_secure = request.url.scheme == "https"
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

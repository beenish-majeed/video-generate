import json
from typing import Callable
from starlette.types import ASGIApp, Receive, Scope, Send

from src.config import settings


class BodySizeLimitExceeded(Exception):
    """Raised when streamed request body exceeds the configured threshold."""
    pass


class RequestBodyLimitMiddleware:
    """
    Pure ASGI middleware that rejects oversized request bodies with HTTP 413.
    Checks Content-Length header early, and streams & counts incoming bytes
    for chunked or unannounced payloads.
    Supports per-route limit overrides (e.g. clip uploads) while maintaining
    small limits for general API routes.
    """

    def __init__(
        self,
        app: ASGIApp,
        max_bytes: int | None = None,
        route_limits: dict[str, int] | None = None,
    ):
        self.app = app
        self.max_bytes = max_bytes if max_bytes is not None else settings.max_request_body_bytes
        self.route_limits = route_limits if route_limits is not None else {
            "/v1/assets/upload": getattr(settings, "max_clip_request_body_bytes", 215 * 1024 * 1024),
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        effective_limit = self.route_limits.get(path, self.max_bytes)

        # 1. Early Content-Length check
        headers = dict(scope.get("headers", []))
        content_length_raw = headers.get(b"content-length")
        if content_length_raw is not None:
            try:
                content_length = int(content_length_raw)
                if content_length > effective_limit:
                    await self._send_413(
                        send,
                        f"Request body length ({content_length} bytes) exceeds limit ({effective_limit} bytes).",
                    )
                    return
            except ValueError:
                pass

        # 2. Streamed chunk counting
        accumulated_bytes = 0
        response_started = False

        async def limited_receive() -> dict:
            nonlocal accumulated_bytes
            message = await receive()
            if message.get("type") == "http.request":
                chunk = message.get("body", b"")
                accumulated_bytes += len(chunk)
                if accumulated_bytes > effective_limit:
                    raise BodySizeLimitExceeded(
                        f"Streamed request body ({accumulated_bytes} bytes) exceeds maximum limit ({effective_limit} bytes)."
                    )
            return message

        async def monitored_send(message: dict) -> None:
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, monitored_send)
        except BodySizeLimitExceeded as exc:
            if not response_started:
                await self._send_413(send, str(exc))

    async def _send_413(self, send: Send, message: str) -> None:
        payload = json.dumps({"detail": message}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode("ascii")),
            ],
        })
        await send({
            "type": "http.response.body",
            "body": payload,
        })

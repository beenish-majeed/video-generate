import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from src.utils.body_limit_middleware import RequestBodyLimitMiddleware


async def echo_endpoint(request: Request):
    body = await request.body()
    return JSONResponse({"received_bytes": len(body)})


def get_test_app(max_bytes: int = 100):
    routes = [Route("/echo", endpoint=echo_endpoint, methods=["POST"])]
    app = Starlette(routes=routes)
    app.add_middleware(RequestBodyLimitMiddleware, max_bytes=max_bytes)
    return app


def test_early_content_length_rejection():
    """Verify that an oversized Content-Length header returns 413 immediately."""
    app = get_test_app(max_bytes=100)
    client = TestClient(app)

    # Payload 150 bytes exceeds 100 max_bytes
    oversized_data = b"x" * 150
    resp = client.post("/echo", content=oversized_data)
    assert resp.status_code == 413
    assert "exceeds limit" in resp.json()["detail"]


def test_chunked_stream_exceeding_limit_returns_413():
    """Verify that a chunked transfer stream exceeding max_bytes triggers 413."""
    app = get_test_app(max_bytes=100)
    client = TestClient(app)

    def chunk_generator():
        # Stream 5 chunks of 30 bytes = 150 bytes
        for _ in range(5):
            yield b"a" * 30

    resp = client.post("/echo", content=chunk_generator())
    assert resp.status_code == 413
    assert "exceeds maximum limit" in resp.json()["detail"] or "exceeded" in resp.json()["detail"]


def test_request_under_limit_passes():
    """Verify that normal requests under the byte limit succeed."""
    app = get_test_app(max_bytes=100)
    client = TestClient(app)

    payload = b"small safe payload"
    resp = client.post("/echo", content=payload)
    assert resp.status_code == 200
    assert resp.json()["received_bytes"] == len(payload)

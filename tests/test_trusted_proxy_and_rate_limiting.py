import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from src.main import app
from src.core.config import settings
from src.utils.rate_limiter import get_client_ip, SCRIPT_LIMITER


def test_trusted_proxy_x_forwarded_for():
    """When connecting from a trusted proxy, X-Forwarded-For client IP is honored."""
    client = TestClient(app)
    # TestClient direct host is "testclient", which is in default trusted_proxies
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "headers": [
            (b"x-forwarded-for", b"203.0.113.195, 10.0.0.1"),
        ],
    }
    req = Request(scope)
    extracted_ip = get_client_ip(req)
    assert extracted_ip == "203.0.113.195"


def test_untrusted_direct_client_spoofing_prevented(monkeypatch):
    """When connecting directly from an untrusted IP, X-Forwarded-For is ignored."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "::1"])

    # Attacker connects directly from 198.51.100.50 and attempts to spoof X-Forwarded-For
    scope = {
        "type": "http",
        "client": ("198.51.100.50", 54321),
        "headers": [
            (b"x-forwarded-for", b"8.8.8.8"),
        ],
    }
    req = Request(scope)
    extracted_ip = get_client_ip(req)
    # Must use actual client IP, not spoofed header
    assert extracted_ip == "198.51.100.50"


def test_invalid_malformed_ip_in_proxy_header():
    """Malformed or invalid IP in X-Forwarded-For falls back safely."""
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "headers": [
            (b"x-forwarded-for", b"<script>alert(1)</script>, invalid_ip"),
        ],
    }
    req = Request(scope)
    extracted_ip = get_client_ip(req)
    assert extracted_ip == "127.0.0.1"


def test_rate_limiting_isolated_per_real_proxy_ip():
    """Different client IPs behind a trusted reverse proxy have independent rate limit buckets."""
    SCRIPT_LIMITER.clear()
    
    # Client 1 uses up rate limit
    for _ in range(SCRIPT_LIMITER.max_requests):
        SCRIPT_LIMITER.check("203.0.113.10")

    # Client 1 is now rate-limited
    with pytest.raises(Exception) as exc_info:
        SCRIPT_LIMITER.check("203.0.113.10")
    assert "Rate limit exceeded" in str(exc_info.value.detail)

    # Client 2 behind the same proxy has their own bucket and is NOT rate-limited
    SCRIPT_LIMITER.check("203.0.113.20")

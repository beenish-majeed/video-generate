import pytest
from starlette.requests import Request

from src.core.config import settings
from src.utils.rate_limiter import get_client_ip, SCRIPT_LIMITER
from src.api.middleware.session import is_request_https
from src.utils.proxy import is_ip_in_trusted_proxies, parse_ip_address


def test_trusted_proxy_x_forwarded_for(monkeypatch):
    """When connecting from an explicitly trusted proxy, X-Forwarded-For client IP is honored."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "10.0.0.1", "::1", "testclient"])
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


def test_untrusted_direct_client_with_fake_x_forwarded_for(monkeypatch):
    """Untrusted direct client sending fake X-Forwarded-For is ignored."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "::1"])
    scope = {
        "type": "http",
        "client": ("198.51.100.50", 54321),
        "headers": [
            (b"x-forwarded-for", b"8.8.8.8"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "198.51.100.50"


def test_untrusted_direct_client_with_fake_x_real_ip(monkeypatch):
    """Untrusted direct client sending fake X-Real-IP is ignored."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "::1"])
    scope = {
        "type": "http",
        "client": ("198.51.100.50", 54321),
        "headers": [
            (b"x-real-ip", b"1.1.1.1"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "198.51.100.50"


def test_attacker_prepended_fake_ip_through_trusted_proxy(monkeypatch):
    """Attacker prepends a fake IP to X-Forwarded-For; right-to-left traversal extracts the real client."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "10.0.0.1"])
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "headers": [
            (b"x-forwarded-for", b"198.51.100.99, 203.0.113.5, 10.0.0.1"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "203.0.113.5"


def test_multiple_explicitly_trusted_proxies(monkeypatch):
    """Multiple proxy hops in the chain are skipped if explicitly in trusted_proxies."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "10.0.0.2", "10.0.0.3"])
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "headers": [
            (b"x-forwarded-for", b"198.51.100.25, 10.0.0.3, 10.0.0.2"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "198.51.100.25"


def test_configured_ipv4_cidrs(monkeypatch):
    """Explicitly configured IPv4 CIDR ranges are supported for proxy matching."""
    monkeypatch.setattr(settings, "trusted_proxies", ["10.0.0.0/8"])
    scope = {
        "type": "http",
        "client": ("10.5.6.7", 12345),
        "headers": [
            (b"x-forwarded-for", b"198.51.100.40, 10.99.1.1"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "198.51.100.40"


def test_configured_ipv6_cidrs(monkeypatch):
    """Explicitly configured IPv6 CIDR ranges are supported for proxy matching."""
    monkeypatch.setattr(settings, "trusted_proxies", ["2001:db8:cafe::/48"])
    scope = {
        "type": "http",
        "client": ("2001:db8:cafe:1::1", 12345),
        "headers": [
            (b"x-forwarded-for", b"203.0.113.77"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "203.0.113.77"


def test_private_ip_not_in_trusted_list_is_rejected_as_proxy(monkeypatch):
    """A private RFC 1918 IP that is NOT explicitly configured in trusted_proxies is NOT trusted."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1"])
    scope = {
        "type": "http",
        "client": ("192.168.1.50", 12345),
        "headers": [
            (b"x-forwarded-for", b"8.8.8.8"),
        ],
    }
    req = Request(scope)
    # Must NOT trust XFF from 192.168.1.50 because it is not in trusted_proxies
    assert get_client_ip(req) == "192.168.1.50"


def test_loopback_proxy(monkeypatch):
    """Loopback proxy addresses (127.0.0.1 and ::1) work when configured."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "::1"])
    scope = {
        "type": "http",
        "client": ("::1", 12345),
        "headers": [
            (b"x-forwarded-for", b"203.0.113.88"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "203.0.113.88"


def test_malformed_forwarding_headers(monkeypatch):
    """Malformed or invalid IP in X-Forwarded-For falls back safely to direct connection IP."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1"])
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "headers": [
            (b"x-forwarded-for", b"<script>alert(1)</script>, invalid_ip, %%%"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "127.0.0.1"


def test_empty_or_missing_client_information():
    """Empty or missing request.client returns 'unknown'."""
    scope = {
        "type": "http",
        "client": None,
        "headers": [
            (b"x-forwarded-for", b"8.8.8.8"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "unknown"


def test_ipv4_mapped_ipv6_addresses(monkeypatch):
    """IPv4-mapped IPv6 address (::ffff:192.168.1.10) is unwrapped and matched against IPv4 CIDR."""
    monkeypatch.setattr(settings, "trusted_proxies", ["192.168.1.0/24"])
    scope = {
        "type": "http",
        "client": ("::ffff:192.168.1.10", 12345),
        "headers": [
            (b"x-forwarded-for", b"203.0.113.99"),
        ],
    }
    req = Request(scope)
    assert get_client_ip(req) == "203.0.113.99"


def test_https_spoofing_through_untrusted_proxy(monkeypatch):
    """Direct untrusted connection sending HTTPS headers is rejected."""
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1"])
    scope = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "server": ("example.com", 80),
        "client": ("198.51.100.5", 54321),
        "headers": [
            (b"x-forwarded-proto", b"https"),
            (b"x-forwarded-ssl", b"on"),
            (b"forwarded", b"proto=https"),
        ],
    }
    req = Request(scope)
    assert is_request_https(req) is False


def test_https_detection_through_explicitly_trusted_proxy(monkeypatch):
    """Direct connection from an explicitly trusted proxy respects forwarded HTTPS headers."""
    monkeypatch.setattr(settings, "trusted_proxies", ["10.0.0.0/8"])
    scope = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "server": ("example.com", 80),
        "client": ("10.1.2.3", 54321),
        "headers": [
            (b"x-forwarded-proto", b"https"),
        ],
    }
    req = Request(scope)
    assert is_request_https(req) is True


def test_testclient_keyword_never_trusted_in_production(monkeypatch):
    """The 'testclient' string literal is never trusted when ENVIRONMENT=production."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "testclient"])
    assert is_ip_in_trusted_proxies("testclient") is False


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

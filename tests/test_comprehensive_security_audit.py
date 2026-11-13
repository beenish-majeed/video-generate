import os
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from starlette.requests import Request
from starlette.datastructures import Headers

from src.config import settings
from src.api.middleware.session import is_request_https
from src.clients.file_ai import _sanitize_error_message
from src.core.session import (
    create_session_id,
    generate_session_token,
    verify_session_token,
    is_valid_session_id,
)
from src.services.slideshow_compositor import SlideshowCompositor
from src.services.store import get_asset_path, job_dir


def test_is_request_https_rejects_untrusted_proxy_spoofing():
    """Verify that an untrusted direct connection cannot spoof HTTPS via headers."""
    # 1. Untrusted remote host attempting X-Forwarded-Proto spoofing
    scope_untrusted = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "client": ("198.51.100.25", 54321),
        "headers": [
            (b"host", b"example.com"),
            (b"x-forwarded-proto", b"https"),
            (b"x-forwarded-ssl", b"on"),
            (b"forwarded", b"proto=https"),
        ],
    }
    req_untrusted = Request(scope_untrusted)
    assert is_request_https(req_untrusted) is False, "Untrusted IP must not be permitted to spoof HTTPS headers!"

    # 2. Trusted proxy host passing real reverse-proxy HTTPS headers
    scope_trusted = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "client": ("127.0.0.1", 54321),
        "headers": [
            (b"host", b"example.com"),
            (b"x-forwarded-proto", b"https"),
        ],
    }
    req_trusted = Request(scope_trusted)
    assert is_request_https(req_trusted) is True, "Trusted proxy HTTPS headers must be accepted."

    # 3. Direct TLS connection
    scope_direct_https = {
        "type": "http",
        "scheme": "https",
        "path": "/",
        "client": ("198.51.100.25", 54321),
        "headers": [(b"host", b"example.com")],
    }
    req_direct_https = Request(scope_direct_https)
    assert is_request_https(req_direct_https) is True


def test_api_key_redaction_covers_all_providers_and_tokens(monkeypatch):
    """Verify comprehensive masking of Google GenAI, fal.ai, and custom secrets in logs/errors."""
    fake_gemini_key = "AIzaSyD_FakeGoogleGenAIKey123456789012"
    fake_fal_key = "fal_sk_live_secret_fal_key_9876543210"
    fake_session_secret = "super_confidential_session_secret_32bytes"

    monkeypatch.setattr(settings, "gemini_api_key", fake_gemini_key)
    monkeypatch.setattr(settings, "session_secret", fake_session_secret)
    monkeypatch.setenv("GEMINI_API_KEY", fake_gemini_key)
    monkeypatch.setenv("FAL_KEY", fake_fal_key)

    raw_error = (
        f"Failed call with key {fake_gemini_key} and fal {fake_fal_key} "
        f"and session secret {fake_session_secret} and query https://api.example.com?api_key={fake_gemini_key}"
    )

    sanitized = _sanitize_error_message(raw_error)

    assert fake_gemini_key not in sanitized
    assert fake_fal_key not in sanitized
    assert fake_session_secret not in sanitized
    assert "[REDACTED_GOOGLE_KEY]" in sanitized or "[REDACTED_API_KEY]" in sanitized
    assert "[REDACTED_FAL_KEY]" in sanitized or "[REDACTED_API_KEY]" in sanitized
    assert "[REDACTED_SECRET]" in sanitized


def test_slideshow_compositor_protocol_whitelist_enforced(tmp_path):
    """Verify that SlideshowCompositor commands strictly enforce -protocol_whitelist file."""
    intercepted_cmds = []

    def mock_subprocess(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = '{"streams":[{"codec_type":"video","duration":"2.0"}],"format":{"duration":"2.0"}}'
        mock_proc.stderr = ""
        return mock_proc

    dummy_img = tmp_path / "scene.png"
    dummy_img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)
    out_clip = tmp_path / "clip.mp4"

    with patch("src.services.slideshow_compositor.run_subprocess", side_effect=mock_subprocess):
        try:
            SlideshowCompositor.render_scene_clip(
                image_path=dummy_img,
                duration_s=2.0,
                motion_idx=0,
                output_path=out_clip,
            )
        except Exception:
            pass

        assert len(intercepted_cmds) > 0
        render_cmd = intercepted_cmds[0]
        assert "-protocol_whitelist" in render_cmd
        pw_idx = render_cmd.index("-protocol_whitelist")
        assert render_cmd[pw_idx + 1] == "file"
        assert "-nostdin" in render_cmd


def test_ffmpeg_utility_commands_enforce_nostdin_and_whitelisting(tmp_path):
    """Verify that ffmpeg utilities enforce -nostdin and protocol whitelisting."""
    intercepted_cmds = []

    def mock_subprocess(cmd, *args, **kwargs):
        intercepted_cmds.append(cmd)
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = '{"streams":[{"codec_type":"audio"}],"format":{"duration":"5.0"}}'
        mock_proc.stderr = ""
        return mock_proc

    from src.utils.ffmpeg import concat_videos, create_placeholder_video

    dummy_clip1 = tmp_path / "c1.mp4"
    dummy_clip1.write_bytes(b"\x00" * 100)
    dummy_clip2 = tmp_path / "c2.mp4"
    dummy_clip2.write_bytes(b"\x00" * 100)
    concat_out = tmp_path / "concat.mp4"

    with patch("src.utils.subprocess_runner.subprocess.Popen") as mock_popen:
        mock_p = MagicMock()
        mock_p.communicate.return_value = ("", "")
        mock_p.poll.return_value = 0
        mock_popen.return_value = mock_p

        concat_videos([str(dummy_clip1), str(dummy_clip2)], concat_out)

        assert mock_popen.called
        call_cmd = mock_popen.call_args[0][0]
        assert "-nostdin" in call_cmd
        assert "-protocol_whitelist" in call_cmd
        assert "file,concat" in call_cmd[call_cmd.index("-protocol_whitelist") + 1]



def test_anonymous_session_signature_tamper_proofing():
    """Verify cryptographically signed session tokens reject tampering, expiry, and clock skew."""
    token, sid = generate_session_token()
    assert is_valid_session_id(sid) is True

    # 1. Valid token verifies
    verified = verify_session_token(token)
    assert verified == sid

    # 2. Tampered session ID in token rejected
    parts = token.split(".")
    tampered_sid_token = f"sess_00000000000000000000000000000000.{parts[1]}.{parts[2]}"
    assert verify_session_token(tampered_sid_token) is None

    # 3. Tampered timestamp rejected
    tampered_ts_token = f"{parts[0]}.{int(parts[1]) - 100}.{parts[2]}"
    assert verify_session_token(tampered_ts_token) is None

    # 4. Tampered signature rejected
    tampered_sig_token = f"{parts[0]}.{parts[1]}.bad_signature_abcdef123456"
    assert verify_session_token(tampered_sig_token) is None

    # 5. Future clock skew (> 60s) rejected
    future_token, _ = generate_session_token(timestamp=int(time.time()) + 120)
    assert verify_session_token(future_token) is None

    # 6. Expired token rejected
    expired_token, _ = generate_session_token(timestamp=int(time.time()) - 10000)
    assert verify_session_token(expired_token, max_age_seconds=300) is None


def test_path_traversal_rejection_across_storage_and_jobs(tmp_path):
    """Verify path traversal payloads are rejected in asset lookups and job directories."""
    traversal_payloads = [
        "../../etc/passwd",
        "..\\..\\windows\\system32\\calc.exe",
        "....//....//sensitive.json",
        "/etc/shadow",
        "C:\\Windows\\System32\\cmd.exe",
        "job_\x00_traversal",
    ]

    for payload in traversal_payloads:
        # Asset path lookup must return None for traversal attempts
        assert get_asset_path(payload) is None

        # job_dir must raise ValueError
        with pytest.raises(ValueError):
            job_dir(payload)


def test_is_request_https_rejects_missing_client_host():
    """Verify missing client information cannot cause untrusted forwarded headers to be trusted."""
    scope_no_client = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "client": None,
        "headers": [
            (b"host", b"example.com"),
            (b"x-forwarded-proto", b"https"),
        ],
    }
    req_no_client = Request(scope_no_client)
    assert is_request_https(req_no_client) is False

    scope_empty_host = {
        "type": "http",
        "scheme": "http",
        "path": "/",
        "client": ("", 0),
        "headers": [
            (b"host", b"example.com"),
            (b"x-forwarded-proto", b"https"),
        ],
    }
    req_empty_host = Request(scope_empty_host)
    assert is_request_https(req_empty_host) is False


def test_get_client_ip_trusted_proxy_chain_and_spoofing_defense(monkeypatch):
    """Verify get_client_ip traverses proxy chain safely and blocks IP spoofing."""
    from src.utils.rate_limiter import get_client_ip

    monkeypatch.setattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "10.0.0.1", "testclient"])

    # 1. Missing client information returns 'unknown'
    req_none = Request({"type": "http", "path": "/", "client": None, "headers": []})
    assert get_client_ip(req_none) == "unknown"

    # 2. Untrusted direct client attempting X-Forwarded-For spoofing
    req_untrusted = Request({
        "type": "http",
        "path": "/",
        "client": ("198.51.100.25", 54321),
        "headers": [(b"x-forwarded-for", b"203.0.113.50, 1.1.1.1")],
    })
    # Must return the real direct connecting IP, ignoring the spoofed header
    assert get_client_ip(req_untrusted) == "198.51.100.25"

    # 3. Trusted reverse proxy forwarding client with attacker-prepended fake IP
    # Proxy chain: Attacker prepends '1.2.3.4', ALB appends real client '203.0.113.99'
    req_proxied = Request({
        "type": "http",
        "path": "/",
        "client": ("127.0.0.1", 54321),
        "headers": [(b"x-forwarded-for", b"1.2.3.4, 203.0.113.99")],
    })
    # Must correctly pick the rightmost untrusted IP (203.0.113.99), not the attacker's 1.2.3.4
    assert get_client_ip(req_proxied) == "203.0.113.99"

    # 4. Multi-hop trusted proxies: Client -> ALB (10.0.0.1) -> Nginx (127.0.0.1)
    req_multihop = Request({
        "type": "http",
        "path": "/",
        "client": ("127.0.0.1", 54321),
        "headers": [(b"x-forwarded-for", b"198.51.100.77, 10.0.0.1")],
    })
    # 10.0.0.1 is in trusted_proxies, so it steps back to real client 198.51.100.77
    assert get_client_ip(req_multihop) == "198.51.100.77"


def test_production_environment_rejects_insecure_default_session_secret(monkeypatch, tmp_path):
    """Verify that in production environment, default placeholder session secret triggers RuntimeError."""
    import src.core.session as session_mod

    monkeypatch.setattr(session_mod, "_CACHED_SECRET_KEY", None)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "session_secret", "insecure_dev_session_secret_change_in_production_min32chars")
    monkeypatch.setattr(settings, "storage_dir", tmp_path / "nonexistent")

    with pytest.raises(RuntimeError, match="CRITICAL SECURITY RISK: Insecure or missing session secret"):
        session_mod._get_signing_key()


def test_file_ai_client_uses_safe_http_transport():
    """Verify that FileAIClient uses SafeHTTPTransport for SSRF and DNS rebinding protection."""
    from src.clients.file_ai import FileAIClient, SafeHTTPTransport

    client = FileAIClient()
    http_client = client._get_client()
    assert isinstance(http_client._transport, SafeHTTPTransport)
    client.close()


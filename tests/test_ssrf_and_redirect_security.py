import pytest
import httpx
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.clients.file_ai import (
    FileAIClient,
    FileAIError,
    _validate_download_url,
    _is_ip_prohibited,
)
import ipaddress


def test_is_ip_prohibited():
    assert _is_ip_prohibited(ipaddress.ip_address("127.0.0.1"))
    assert _is_ip_prohibited(ipaddress.ip_address("10.0.0.5"))
    assert _is_ip_prohibited(ipaddress.ip_address("172.16.0.1"))
    assert _is_ip_prohibited(ipaddress.ip_address("192.168.1.1"))
    assert _is_ip_prohibited(ipaddress.ip_address("169.254.169.254"))
    assert _is_ip_prohibited(ipaddress.ip_address("::1"))
    assert _is_ip_prohibited(ipaddress.ip_address("::ffff:127.0.0.1"))
    assert _is_ip_prohibited(ipaddress.ip_address("0.0.0.0"))
    # Public IP should not be prohibited
    assert not _is_ip_prohibited(ipaddress.ip_address("8.8.8.8"))
    assert not _is_ip_prohibited(ipaddress.ip_address("1.1.1.1"))


def test_validate_download_url_comprehensive():
    # Prohibited hosts and schemes
    with pytest.raises(FileAIError, match="only HTTPS"):
        _validate_download_url("http://example.com/file.mp4")

    with pytest.raises(FileAIError, match="only HTTPS"):
        _validate_download_url("ftp://example.com/file.mp4")

    # Prohibited ports
    with pytest.raises(FileAIError, match="prohibited port"):
        _validate_download_url("https://example.com:22/file.mp4")

    with pytest.raises(FileAIError, match="prohibited port"):
        _validate_download_url("https://example.com:25/file.mp4")

    with pytest.raises(FileAIError, match="prohibited port"):
        _validate_download_url("https://example.com:8000/file.mp4")

    # Integer decimal host (2130706433 == 127.0.0.1)
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://2130706433/file.mp4")

    # Hexadecimal host (0x7f000001 == 127.0.0.1)
    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://0x7f000001/file.mp4")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://metadata.google.internal/computeMetadata/v1/")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://service.internal/data")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://gateway.local/api")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://127.0.0.1:8443/secret")

    with pytest.raises(FileAIError, match="SSRF blocked"):
        _validate_download_url("https://169.254.169.254/latest/meta-data")


def test_dns_rebinding_peer_ip_interception():
    from src.clients.file_ai import SafeSyncBackend

    class MockRebindingStream:
        class MockSock:
            def getpeername(self):
                return ("127.0.0.1", 443)
            def close(self):
                pass
        _sock = MockSock()
        def close(self):
            pass

    backend = SafeSyncBackend()
    with patch("httpcore._backends.sync.SyncBackend.connect_tcp", return_value=MockRebindingStream()):
        with pytest.raises(FileAIError, match="SSRF / DNS rebinding blocked"):
            backend.connect_tcp("malicious-rebinding-domain.com", 443)


def test_safe_download_redirect_to_ssrf_blocked(tmp_path):
    client = FileAIClient()
    target = tmp_path / "downloaded.mp4"

    # Mock httpx.Client response sequence: first response is 302 redirecting to private IP
    mock_resp1 = MagicMock()
    mock_resp1.status_code = 302
    mock_resp1.headers = {"Location": "https://127.0.0.1:8000/stolen-secret"}

    with patch("src.clients.file_ai._validate_download_url") as mock_validate:
        # First call passes (valid public CDN URL), second call detects redirect to 127.0.0.1
        def side_effect(url):
            if "127.0.0.1" in url:
                raise FileAIError("SSRF blocked: local or internal host is prohibited")

        mock_validate.side_effect = side_effect

        with patch("httpx.Client.stream") as mock_stream:
            mock_stream.return_value.__enter__.return_value = mock_resp1

            with pytest.raises(FileAIError, match="SSRF blocked"):
                client._safe_download_file("https://cdn.example.com/asset.mp4", target)

    assert not target.exists()


def test_safe_download_content_length_limit_exceeded(tmp_path):
    client = FileAIClient()
    target = tmp_path / "oversized.mp4"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    # 200 MB declared in header
    mock_resp.headers = {"Content-Length": str(200 * 1024 * 1024)}

    with patch("src.clients.file_ai._validate_download_url"):
        with patch("httpx.Client.stream") as mock_stream:
            mock_stream.return_value.__enter__.return_value = mock_resp

            with pytest.raises(FileAIError, match="exceeds maximum permitted limit"):
                client._safe_download_file(
                    "https://cdn.example.com/large.mp4",
                    target,
                    max_download_size_bytes=50 * 1024 * 1024,
                )

    assert not target.exists()


def test_safe_download_streaming_size_limit_exceeded(tmp_path):
    client = FileAIClient()
    target = tmp_path / "stream_bomb.mp4"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    mock_resp.headers = {}  # No Content-Length provided (chunked transfer)
    # Stream returns chunks totaling 2 MB
    mock_resp.iter_bytes.return_value = [b"A" * 65536] * 32

    with patch("src.clients.file_ai._validate_download_url"):
        with patch("httpx.Client.stream") as mock_stream:
            mock_stream.return_value.__enter__.return_value = mock_resp

            with pytest.raises(FileAIError, match="Download stream exceeded maximum permitted limit"):
                client._safe_download_file(
                    "https://cdn.example.com/stream.mp4",
                    target,
                    max_download_size_bytes=500 * 1024,  # Cap at 500 KB
                )

    assert not target.exists()
    # Confirm no temp files left behind
    assert len(list(tmp_path.glob("*.tmp"))) == 0


def test_safe_download_too_many_redirects(tmp_path):
    client = FileAIClient()
    target = tmp_path / "loop.mp4"

    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_resp.headers = {"Location": "https://cdn.example.com/redirect"}

    with patch("src.clients.file_ai._validate_download_url"):
        with patch("httpx.Client.stream") as mock_stream:
            mock_stream.return_value.__enter__.return_value = mock_resp

            with pytest.raises(FileAIError, match="Too many redirects"):
                client._safe_download_file(
                    "https://cdn.example.com/loop",
                    target,
                    max_redirects=2,
                )

    assert not target.exists()


def test_safe_download_empty_response_rejected(tmp_path):
    """Empty download response (0 bytes) is rejected and cleaned up."""
    client = FileAIClient()
    target = tmp_path / "empty.mp4"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    mock_resp.headers = {"Content-Length": "0"}
    mock_resp.iter_bytes.return_value = []

    with patch("src.clients.file_ai._validate_download_url"):
        with patch("httpx.Client.stream") as mock_stream:
            mock_stream.return_value.__enter__.return_value = mock_resp

            with pytest.raises(FileAIError, match="empty \\(0 bytes\\)"):
                client._safe_download_file(
                    "https://cdn.example.com/empty.mp4",
                    target,
                )

    assert not target.exists()
    assert len(list(tmp_path.glob("*.tmp"))) == 0


def test_validate_download_url_mixed_dns_resolution():
    """If DNS resolution returns multiple addresses and one is private, SSRF is blocked."""
    import socket
    mock_addrinfo = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),  # Public
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443)),       # Private
    ]
    with patch("socket.getaddrinfo", return_value=mock_addrinfo):
        with pytest.raises(FileAIError, match="SSRF blocked:.*resolves to prohibited address 10.0.0.1"):
            _validate_download_url("https://dual-homed-target.com/file.mp4")


def test_video_provider_fal_status_uses_safe_transport():
    """Verify fal.ai status verification routes through SafeHTTPTransport."""
    from src.services.video_provider import FalAIVideoProvider
    from src.clients.file_ai import SafeHTTPTransport

    provider = FalAIVideoProvider(api_key="fal_sk_test_key_12345678")

    intercepted_transports = []

    class MockClient:
        def __init__(self, transport=None, **kwargs):
            intercepted_transports.append(transport)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get(self, url, headers=None):
            mock_res = MagicMock()
            mock_res.status_code = 200
            mock_res.json.return_value = {"is_locked": False}
            return mock_res

    with patch("httpx.Client", side_effect=MockClient):
        res = provider.check_account_status()
        assert res["status"] == "ready"
        assert len(intercepted_transports) == 1
        assert isinstance(intercepted_transports[0], SafeHTTPTransport)


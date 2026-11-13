import ipaddress
import re
from collections import OrderedDict
import threading
import time
from fastapi import HTTPException, Request, status

from src.config import settings


class BoundedSlidingWindowLimiter:
    """
    Sliding window rate limiter with a bounded dictionary to prevent memory leaks.
    Thread-safe execution protected by a threading.Lock() mutex.
    Old expired entries and LRU keys are evicted when capacity is reached.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float = 60.0,
        max_keys: int = 5000,
        name: str = "operation",
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self.name = name
        self._history: OrderedDict[str, list[float]] = OrderedDict()
        self._lock = threading.Lock()

    def check(self, client_id: str) -> None:
        with self._lock:
            now = time.time()

            # Evict old inactive keys if approaching capacity
            if len(self._history) >= self.max_keys and client_id not in self._history:
                keys_to_remove = []
                for k, ts in list(self._history.items())[:100]:
                    if not ts or now - ts[-1] >= self.window_seconds:
                        keys_to_remove.append(k)
                for k in keys_to_remove:
                    self._history.pop(k, None)

                while len(self._history) >= self.max_keys:
                    self._history.popitem(last=False)

            if client_id in self._history:
                self._history.move_to_end(client_id)
                timestamps = [t for t in self._history[client_id] if now - t < self.window_seconds]
            else:
                timestamps = []

            if len(timestamps) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - timestamps[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded: maximum {self.max_requests} {self.name} requests per {int(self.window_seconds)}s.",
                    headers={"Retry-After": str(max(1, retry_after))},
                )

            timestamps.append(now)
            self._history[client_id] = timestamps
            self._history.move_to_end(client_id)

    def clear(self) -> None:
        """Clear all rate limit history (useful for testing)."""
        with self._lock:
            self._history.clear()


_INTERNAL_PROXY_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_proxy_or_internal_network(
    ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address,
    trusted_list: list[str],
) -> bool:
    """Check if an IP is in the configured trusted_proxies list or is an RFC 1918 / loopback internal hop."""
    ip_str = str(ip_obj)
    if ip_str in trusted_list:
        return True
    return any(ip_obj in net for net in _INTERNAL_PROXY_NETWORKS)


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address for rate limiting and logging with trusted-proxy verification.
    If the direct connecting client is a trusted proxy, inspects X-Forwarded-For, X-Real-IP, or Forwarded.
    If the direct connecting client is untrusted or missing, proxy headers are ignored to prevent IP spoofing.

    Uses a secure right-to-left traversal over X-Forwarded-For: stepping backwards past trusted and
    internal proxy hops to find the first untrusted external client IP, completely preventing attackers
    from prepending arbitrary fake IPs to evade rate limits.
    """
    direct_ip = request.client.host if request.client and request.client.host else ""
    if not direct_ip:
        return "unknown"

    trusted = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "testclient"])
    # If direct connection is not from a trusted proxy, do not trust proxy headers
    if direct_ip not in trusted:
        return direct_ip

    # Direct connection is from a trusted proxy:
    # 1. Parse X-Forwarded-For (standard: client, proxy1, proxy2) using right-to-left traversal
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        for p in reversed(parts):
            try:
                ip_obj = ipaddress.ip_address(p)
                if _is_proxy_or_internal_network(ip_obj, trusted):
                    continue
                return str(ip_obj)
            except ValueError:
                continue
        # If all IPs in chain were trusted/internal proxies, fallback to leftmost valid IP
        for p in parts:
            try:
                return str(ipaddress.ip_address(p))
            except ValueError:
                continue

    # 2. Check X-Real-IP (only trusted when direct connection is from trusted proxy and no XFF chain)
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        try:
            return str(ipaddress.ip_address(x_real_ip.strip()))
        except ValueError:
            pass

    # 3. Fallback to Forwarded header (RFC 7239: for=192.0.2.60)
    fwd = request.headers.get("Forwarded")
    if fwd:
        matches = re.findall(r'for=(?:"?\[?)([a-zA-Z0-9\.\:]+)(?:\]?"?)', fwd)
        for candidate in reversed(matches):
            try:
                ip_obj = ipaddress.ip_address(candidate)
                if _is_proxy_or_internal_network(ip_obj, trusted):
                    continue
                return str(ip_obj)
            except ValueError:
                pass
        if matches:
            try:
                return str(ipaddress.ip_address(matches[0]))
            except ValueError:
                pass

    return direct_ip


# Global bounded rate limiters
SCRIPT_LIMITER = BoundedSlidingWindowLimiter(
    max_requests=settings.script_rate_limit_per_minute,
    window_seconds=60.0,
    name="script generation",
)

UPLOAD_LIMITER = BoundedSlidingWindowLimiter(
    max_requests=settings.upload_rate_limit_per_minute,
    window_seconds=60.0,
    name="upload",
)

JOB_CREATION_LIMITER = BoundedSlidingWindowLimiter(
    max_requests=settings.job_create_rate_limit_per_minute,
    window_seconds=60.0,
    name="job creation",
)

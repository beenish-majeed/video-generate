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


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address for rate limiting and logging with trusted-proxy verification.
    If the direct connecting client is a trusted proxy, inspects X-Real-IP, X-Forwarded-For, or Forwarded.
    If the direct connecting client is untrusted or missing, proxy headers are ignored to prevent IP spoofing.
    """
    direct_ip = request.client.host if request.client and request.client.host else ""
    if not direct_ip:
        return "unknown"

    trusted = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "testclient"])
    # If direct connection is not from a trusted proxy, do not trust proxy headers
    if direct_ip not in trusted:
        return direct_ip

    # Direct connection is from a trusted proxy:
    # 1. Prefer X-Real-IP (set by reverse proxies like Nginx/Cloudflare to verified client IP)
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        try:
            return str(ipaddress.ip_address(x_real_ip.strip()))
        except ValueError:
            pass

    # 2. Parse X-Forwarded-For (standard: client, proxy1, proxy2 - leftmost valid IP)
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        for p in parts:
            try:
                ip_obj = ipaddress.ip_address(p)
                return str(ip_obj)
            except ValueError:
                continue

    # 3. Fallback to Forwarded header (RFC 7239: for=192.0.2.60)
    fwd = request.headers.get("Forwarded")
    if fwd:
        m = re.search(r'for=(?:"?\[?)([a-zA-Z0-9\.\:]+)(?:\]?"?)', fwd)
        if m:
            candidate = m.group(1)
            try:
                ip_obj = ipaddress.ip_address(candidate)
                return str(ip_obj)
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

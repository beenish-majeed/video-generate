from collections import OrderedDict
import time
from fastapi import HTTPException, Request, status

from src.config import settings


class BoundedSlidingWindowLimiter:
    """
    Sliding window rate limiter with a bounded dictionary to prevent memory leaks.
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

    def check(self, client_id: str) -> None:
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


def get_client_ip(request: Request) -> str:
    """Extract client IP address for rate limiting."""
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


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

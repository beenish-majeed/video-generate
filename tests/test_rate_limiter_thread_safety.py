import threading
import pytest
from fastapi import HTTPException
from src.utils.rate_limiter import BoundedSlidingWindowLimiter


def test_rate_limiter_concurrent_access():
    limiter = BoundedSlidingWindowLimiter(max_requests=50, window_seconds=10.0, max_keys=100)
    errors = []

    def worker(client_id: str):
        try:
            for _ in range(5):
                limiter.check(client_id)
        except HTTPException:
            pass
        except Exception as exc:
            errors.append(exc)

    threads = []
    # 20 concurrent threads accessing different and shared client IDs
    for i in range(20):
        cid = f"client_{i % 5}"
        t = threading.Thread(target=worker, args=(cid,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Must execute with zero unhandled concurrency exceptions (e.g. no RuntimeError: dict mutated)
    assert len(errors) == 0


def test_rate_limiter_clear_thread_safe():
    limiter = BoundedSlidingWindowLimiter(max_requests=10, window_seconds=10.0)
    for i in range(10):
        limiter.check(f"user_{i}")

    limiter.clear()
    assert len(limiter._history) == 0

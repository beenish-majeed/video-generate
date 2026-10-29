import pytest
from src.utils.rate_limiter import SCRIPT_LIMITER, UPLOAD_LIMITER, JOB_CREATION_LIMITER


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Ensure test rate limiters are cleared between test cases for clean test isolation."""
    SCRIPT_LIMITER.clear()
    UPLOAD_LIMITER.clear()
    JOB_CREATION_LIMITER.clear()
    yield
    SCRIPT_LIMITER.clear()
    UPLOAD_LIMITER.clear()
    JOB_CREATION_LIMITER.clear()

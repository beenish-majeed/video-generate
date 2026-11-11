import pytest
from src.utils.rate_limiter import SCRIPT_LIMITER, UPLOAD_LIMITER, JOB_CREATION_LIMITER
from src.services.job_recovery import recover_interrupted_jobs


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Ensure test rate limiters and stale active jobs are cleared between test cases for clean test isolation."""
    SCRIPT_LIMITER.clear()
    UPLOAD_LIMITER.clear()
    JOB_CREATION_LIMITER.clear()
    try:
        recover_interrupted_jobs()
    except Exception:
        pass
    yield
    SCRIPT_LIMITER.clear()
    UPLOAD_LIMITER.clear()
    JOB_CREATION_LIMITER.clear()
    try:
        recover_interrupted_jobs()
    except Exception:
        pass

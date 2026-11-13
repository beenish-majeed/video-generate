import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from src.api.dependencies import (
    JOB_CREATION_LIMITER,
    SCRIPT_LIMITER,
    UPLOAD_LIMITER,
    api_key_header,
    verify_api_key,
)
from src.api.error_handlers import (
    file_ai_exception_handler,
    sanitized_validation_exception_handler,
    unhandled_exception_handler,
)
from src.api.routes import JOB_CREATION_LOCK, JOB_EXECUTOR, router
from src.clients.file_ai import FileAIError
from src.core.config import settings
from src.db.database import init_database
from src.services.job_recovery import recover_interrupted_jobs
from src.services.jobs import (
    cancel_job,
    count_active_jobs,
    create_job,
    delete_job_record,
    get_job,
    list_all_jobs,
    load_job_record,
    run_job,
)
from src.services.script_writer import ScriptWriterError, generate_script
from src.services.store import save_upload
from src.utils.body_limit_middleware import RequestBodyLimitMiddleware
from src.api.middleware.session import AnonymousSessionMiddleware

logger = logging.getLogger(__name__)

# Test backward compatibility alias
_script_rate_limit_history = SCRIPT_LIMITER

DISALLOWED_KEY_PLACEHOLDERS = {
    "your_secret_api_key_here",
    "change_me",
    "placeholder",
    "secret",
    "admin",
    "dev_key_123",
    "1234567890123456",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Verify Server API Key Security
    key = (settings.api_key or "").strip()
    if not settings.allow_insecure_dev:
        if not key:
            raise RuntimeError(
                "CRITICAL SECURITY RISK: API_KEY is not configured and ALLOW_INSECURE_DEV is False. "
                "Application refused to start. Set API_KEY or set ALLOW_INSECURE_DEV=true for local dev."
            )
        if key.lower() in DISALLOWED_KEY_PLACEHOLDERS:
            raise RuntimeError(
                f"CRITICAL SECURITY RISK: API_KEY uses an insecure placeholder ('{key[:4]}...'). "
                "Application refused to start with insecure credentials. Set a strong random API key."
            )
        if len(key) < 16:
            raise RuntimeError(
                f"CRITICAL SECURITY RISK: API_KEY is too short ({len(key)} chars; minimum 16 required). "
                "Application refused to start. Set a longer API key or set ALLOW_INSECURE_DEV=true for local dev."
            )

        if getattr(settings, "environment", "development").lower() == "production":
            session_sec = (settings.session_secret or "").strip()
            if session_sec == "insecure_dev_session_secret_change_in_production_min32chars" or len(session_sec) < 32:
                raise RuntimeError(
                    "CRITICAL SECURITY RISK: SESSION_SECRET is not configured or uses insecure default in production. "
                    "Application refused to start. Set a secure SESSION_SECRET environment variable (minimum 32 characters)."
                )

    # 2. Initialize SQLite Database Schema
    try:
        init_database()
    except Exception as exc:
        logger.error(f"Startup database initialization error: {exc}")

    # 3. Recover Interrupted Jobs
    try:
        count = recover_interrupted_jobs()
        if count > 0:
            logger.info(f"Startup recovery: marked {count} interrupted jobs as FAILED.")
    except Exception as exc:
        logger.warning(f"Startup recovery check notice: {exc}")

    # 4. Storage Retention Cleanup
    try:
        from src.services.storage_retention import clean_expired_storage
        clean_expired_storage()
    except Exception as exc:
        logger.warning(f"Startup storage retention cleanup notice: {exc}")

    yield

    # 5. Graceful Shutdown & Resource Cleanup
    try:
        JOB_EXECUTOR.shutdown(wait=False, cancel_futures=True)
    except Exception:
        pass

    try:
        from src.clients.file_ai import get_file_ai_client
        get_file_ai_client().close()
    except Exception:
        pass


docs_url = "/docs" if settings.allow_insecure_dev else None
redoc_url = "/redoc" if settings.allow_insecure_dev else None
openapi_url = "/openapi.json" if settings.allow_insecure_dev else None

app = FastAPI(
    title="Video Generation Studio API",
    version="2.0.0",
    description="Modernized API-based backend for video synthesis, audio generation, and scene assembly.",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

# CORS configuration
allow_all_origins = "*" in settings.cors_allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Content-Type-Options"],
)

# Request body size enforcement
app.add_middleware(RequestBodyLimitMiddleware)

# Anonymous session enforcement & cookie management
app.add_middleware(AnonymousSessionMiddleware)


# Security headers enforcement & HTTPS redirect
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    from src.api.middleware.session import is_request_https
    if getattr(settings, "enforce_https", False) and not is_request_https(request):
        url = request.url.replace(scheme="https")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=str(url), status_code=307)

    response = await call_next(request)
    if is_request_https(request) or getattr(settings, "enforce_https", False):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = (
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    )
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        if "Content-Security-Policy" not in response.headers:
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


# Centralized exception handlers
app.add_exception_handler(RequestValidationError, sanitized_validation_exception_handler)
app.add_exception_handler(FileAIError, file_ai_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Mount all API endpoints
app.include_router(router)

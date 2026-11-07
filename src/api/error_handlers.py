import logging
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.clients.file_ai import FileAIError

logger = logging.getLogger(__name__)


async def sanitized_validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Validation error handler that avoids leaking raw user payload values or secrets in logs.
    """
    field_errors = []
    for err in exc.errors():
        field_errors.append(f"{'.'.join(str(loc) for loc in err.get('loc', []))}: {err.get('type')}")
    logger.warning(f"Validation error on {request.method} {request.url.path}: {'; '.join(field_errors)}")

    sanitized_details = []
    for err in exc.errors():
        sanitized_details.append({
            "loc": err.get("loc"),
            "msg": err.get("msg"),
            "type": err.get("type"),
        })
    return JSONResponse(status_code=422, content={"detail": sanitized_details})


async def file_ai_exception_handler(request: Request, exc: FileAIError):
    """
    Catches FileAIError and returns sanitized bad gateway/service unavailable response.
    """
    status_code = exc.status_code if exc.status_code and 400 <= exc.status_code < 600 else 502
    logger.error(f"File.ai API error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(status_code=status_code, content={"detail": str(exc)})


async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catches unhandled server exceptions, logs full stack trace securely to server log,
    and returns a generic, non-leaking 500 error response to the client.
    """
    if isinstance(exc, StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    logger.exception(f"Unhandled server error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )

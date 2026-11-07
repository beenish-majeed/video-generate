"""
File.ai & fal.ai API Configuration
==================================
This is the designated API configuration module for cloud AI services (File.ai / fal.ai).

Security & Configuration:
- Securely reads API key from environment variables (FILE_AI_API_KEY or FAL_KEY) or .env file.
- Automatically handles fal.ai keys (fal_sk_...) using the official 'Key' authorization header.
- Never prints or leaks secret keys in string representations, logs, or responses.
- Provides fallback to sandbox when key is missing or unconfigured.
"""

import os
from typing import Optional
from pydantic import BaseModel, Field


# ==============================================================================
# >>> DEFAULT / FALLBACK KEY PLACEHOLDER <<<
# The key is loaded securely from FILE_AI_API_KEY or FAL_KEY in the environment / .env
# ==============================================================================
DEFAULT_FILE_AI_API_KEY: str = ""

# Base endpoints
DEFAULT_FILE_AI_BASE_URL: str = "https://api.file.ai/v1"
DEFAULT_FAL_BASE_URL: str = "https://queue.fal.run"

# Request timeouts and resilient retry configuration
DEFAULT_FILE_AI_TIMEOUT_SECONDS: float = 60.0
DEFAULT_FILE_AI_MAX_RETRIES: int = 3
DEFAULT_FILE_AI_RETRY_BACKOFF_FACTOR: float = 1.5


def _resolve_initial_api_key() -> str:
    """Resolve the API key securely from environment variables."""
    return (
        os.getenv("FILE_AI_API_KEY")
        or os.getenv("FAL_KEY")
        or DEFAULT_FILE_AI_API_KEY
    ).strip()


class FileAIConfig(BaseModel):
    """Configuration schema for File.ai & fal.ai API integration."""
    api_key: str = Field(
        default_factory=_resolve_initial_api_key,
        description="Secret API key. Loaded from FILE_AI_API_KEY or FAL_KEY in .env.",
    )
    base_url: str = Field(
        default=DEFAULT_FILE_AI_BASE_URL,
        description="Base URL for API endpoints.",
    )
    timeout_seconds: float = Field(
        default=DEFAULT_FILE_AI_TIMEOUT_SECONDS,
        description="HTTP request timeout in seconds.",
    )
    max_retries: int = Field(
        default=DEFAULT_FILE_AI_MAX_RETRIES,
        description="Maximum retry attempts on transient network or rate-limit errors.",
    )
    backoff_factor: float = Field(
        default=DEFAULT_FILE_AI_RETRY_BACKOFF_FACTOR,
        description="Exponential backoff multiplier for retries.",
    )
    mock_fallback_enabled: bool = Field(
        default=True,
        description="Enable sandbox/mock fallback mode when API key is not yet provided or balance is exhausted.",
    )

    def model_post_init(self, __context) -> None:
        if not self.api_key:
            self.api_key = _resolve_initial_api_key()
        if self.is_fal and self.is_configured:
            os.environ["FAL_KEY"] = self.api_key
            if self.base_url == DEFAULT_FILE_AI_BASE_URL:
                self.base_url = DEFAULT_FAL_BASE_URL

    @property
    def is_fal(self) -> bool:
        """Returns True if the configured key is a fal.ai key format."""
        key = (self.api_key or "").strip()
        return key.startswith("fal_sk_") or "fal_sk_" in key

    @property
    def provider_name(self) -> str:
        return "fal.ai" if self.is_fal else "file_ai"

    @property
    def is_configured(self) -> bool:
        """Returns True if a valid, non-placeholder API key has been provided."""
        key = (self.api_key or "").strip()
        if not key:
            return False
        placeholders = {
            "your_file_ai_api_key_here",
            "file_ai_key_placeholder",
            "insert_key_here",
            "placeholder",
            "changeme",
        }
        return key.lower() not in placeholders and len(key) >= 8

    @property
    def masked_api_key(self) -> str:
        """Returns a safe, masked representation of the API key for logging."""
        key = (self.api_key or "").strip()
        if not key:
            return "[NOT_CONFIGURED]"
        if len(key) <= 12:
            return f"{key[:3]}...{key[-2:]}"
        return f"{key[:8]}...{key[-4:]}"

    @property
    def api_base_url(self) -> str:
        if self.is_fal and self.base_url == DEFAULT_FILE_AI_BASE_URL:
            return DEFAULT_FAL_BASE_URL
        return self.base_url

    def get_headers(self) -> dict[str, str]:
        """Construct standard HTTP headers for API requests."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "VideoStudio-Backend/2.0 (API-Driven)",
        }
        if self.is_configured:
            if self.is_fal:
                headers["Authorization"] = f"Key {self.api_key}"
            else:
                headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def __repr__(self) -> str:
        return (
            f"FileAIConfig(provider='{self.provider_name}', "
            f"configured={self.is_configured}, "
            f"key='{self.masked_api_key}', "
            f"base_url='{self.api_base_url}')"
        )

    def __str__(self) -> str:
        return self.__repr__()


file_ai_config = FileAIConfig()

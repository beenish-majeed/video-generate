"""
File.ai API Configuration
=========================
This is the DESIGNATED API configuration module for File.ai integration.

HOW TO INTEGRATE YOUR FILE.AI API KEY:
-------------------------------------
1. Paste your File.ai API key directly into the `FILE_AI_API_KEY` setting below,
   OR set the `FILE_AI_API_KEY` variable in your project's `.env` file.
2. If `FILE_AI_API_KEY` is empty, unset, or set to a placeholder, the system
   automatically operates in safe sandbox/mock fallback mode so that all
   workflows, test suites, and frontend interactions work reliably.
3. Once the live key is inserted, the FileAIClient automatically switches to live API mode.
"""

from typing import Optional
from pydantic import BaseModel, Field


# ==============================================================================
# >>> PASTE YOUR FILE.AI API KEY HERE OR IN .env AS FILE_AI_API_KEY <<<
# ==============================================================================
DEFAULT_FILE_AI_API_KEY: str = ""

# Base endpoint for File.ai API services
DEFAULT_FILE_AI_BASE_URL: str = "https://api.file.ai/v1"

# Request timeouts and resilient retry configuration
DEFAULT_FILE_AI_TIMEOUT_SECONDS: float = 60.0
DEFAULT_FILE_AI_MAX_RETRIES: int = 3
DEFAULT_FILE_AI_RETRY_BACKOFF_FACTOR: float = 1.5


class FileAIConfig(BaseModel):
    """Configuration schema for File.ai API integration."""
    api_key: str = Field(
        default=DEFAULT_FILE_AI_API_KEY,
        description="File.ai secret API key. Insert your key here or set FILE_AI_API_KEY in .env.",
    )
    base_url: str = Field(
        default=DEFAULT_FILE_AI_BASE_URL,
        description="Base URL for File.ai API endpoints.",
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
        description="Enable sandbox/mock fallback mode when API key is not yet provided.",
    )

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

    def get_headers(self) -> dict[str, str]:
        """Construct standard HTTP headers for File.ai API requests."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "VideoStudio-Backend/2.0 (API-Driven)",
        }
        if self.is_configured:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers


file_ai_config = FileAIConfig()

import abc
import re
import time
from typing import Any, Callable

import httpx

from src.config import settings


class LLMError(Exception):
    """Raised when an LLM provider encounters a timeout, rate limit, or generation error."""
    pass


def _sanitize_message(message: str, secret_key: str | None = None) -> str:
    """Sanitize any API keys or authorization tokens from error messages."""
    sanitized = str(message)
    if secret_key and len(secret_key) > 4:
        sanitized = sanitized.replace(secret_key, "[REDACTED_API_KEY]")
    # Scrub common Anthropic and Bearer token formats
    sanitized = re.sub(r"sk-ant-[a-zA-Z0-9_\-]+", "[REDACTED_API_KEY]", sanitized)
    sanitized = re.sub(r"(Bearer\s+)[a-zA-Z0-9_\.\-]+", r"\1[REDACTED_API_KEY]", sanitized)
    return sanitized


class LLMProvider(abc.ABC):
    """Abstract base provider for LLM text generation."""

    @abc.abstractmethod
    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        """Generate text completion from system instructions and user input."""
        raise NotImplementedError


class FakeLLMProvider(LLMProvider):
    """
    Deterministic fake LLM provider for tests.
    Does not perform any network calls.
    """

    def __init__(
        self,
        canned_response: str | None = None,
        response_generator: Callable[[str, str, int], str] | None = None,
        error_to_raise: Exception | None = None,
    ):
        self.canned_response = canned_response
        self.response_generator = response_generator
        self.error_to_raise = error_to_raise
        self.call_history: list[dict[str, Any]] = []

    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        self.call_history.append({"system": system, "user": user, "max_tokens": max_tokens})
        if self.error_to_raise is not None:
            raise self.error_to_raise

        if self.response_generator is not None:
            return self.response_generator(system, user, max_tokens)

        if self.canned_response is not None:
            return self.canned_response

        # Default deterministic response
        return f"[fake-llm] System: {system[:30]} | User: {user[:50]} (max_tokens: {max_tokens})"


class AnthropicLLMProvider(LLMProvider):
    """
    Official Anthropic SDK provider for Claude models.
    Handles timeout, rate limits, transient 5xx errors with exponential backoff retries.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int = 2,
        backoff_factor: float = 0.5,
        sleep_fn: Callable[[float], None] = time.sleep,
        client: Any = None,
    ):
        self.api_key = api_key or settings.anthropic_api_key
        self.model = model or settings.llm_model or "claude-haiku-4-5-20251001"
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.llm_timeout_seconds
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.sleep_fn = sleep_fn
        self._client = client

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key:
            raise LLMError("Anthropic API key is not configured. Set ANTHROPIC_API_KEY in environment or settings.")
        import anthropic
        self._client = anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout_seconds)
        return self._client

    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        import anthropic

        client = self._get_client()

        for attempt in range(self.max_retries + 1):
            try:
                response = client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                )

                text_blocks: list[str] = []
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        text_blocks.append(getattr(block, "text", ""))
                    elif hasattr(block, "text"):
                        text_blocks.append(str(block.text))

                return "".join(text_blocks).strip()

            except (anthropic.RateLimitError, anthropic.APITimeoutError, anthropic.APIConnectionError) as exc:
                if attempt < self.max_retries:
                    self.sleep_fn(self.backoff_factor * (2 ** attempt))
                    continue
                clean_err = _sanitize_message(str(exc), self.api_key)
                raise LLMError(f"Anthropic transient failure after {self.max_retries} retries: {clean_err}") from None

            except anthropic.APIStatusError as exc:
                if exc.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    self.sleep_fn(self.backoff_factor * (2 ** attempt))
                    continue
                clean_msg = _sanitize_message(str(exc.message if hasattr(exc, "message") else exc), self.api_key)
                raise LLMError(f"Anthropic provider API error (status {exc.status_code}): {clean_msg}") from None

            except anthropic.APIError as exc:
                clean_err = _sanitize_message(str(exc), self.api_key)
                raise LLMError(f"Anthropic provider error: {clean_err}") from None

            except Exception as exc:
                clean_err = _sanitize_message(str(exc), self.api_key)
                raise LLMError(f"Anthropic generation failed: {clean_err}") from None

        raise LLMError(f"Anthropic request failed after {self.max_retries} retries.")

    def __repr__(self) -> str:
        return f"AnthropicLLMProvider(model={self.model!r}, timeout={self.timeout_seconds})"


class OllamaLLMProvider(LLMProvider):
    """
    Ollama local HTTP provider.
    Calls local Ollama endpoint (e.g. http://localhost:11434/api/chat) with retry on transient errors.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int = 2,
        backoff_factor: float = 0.5,
        sleep_fn: Callable[[float], None] = time.sleep,
        http_client: httpx.Client | None = None,
    ):
        self.base_url = (base_url or settings.ollama_url or "http://localhost:11434").rstrip("/")
        self.model = model or settings.llm_model or "llama3.2"
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.llm_timeout_seconds
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.sleep_fn = sleep_fn
        self._http_client = http_client

    def _get_http_client(self) -> httpx.Client:
        if self._http_client is not None:
            return self._http_client
        self._http_client = httpx.Client(timeout=self.timeout_seconds)
        return self._http_client

    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        client = self._get_http_client()
        url = f"{self.base_url}/api/chat"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "options": {
                "num_predict": max_tokens,
            },
            "stream": False,
        }

        for attempt in range(self.max_retries + 1):
            try:
                response = client.post(url, json=payload)
                if response.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    self.sleep_fn(self.backoff_factor * (2 ** attempt))
                    continue

                response.raise_for_status()
                data = response.json()

                # Extract response text from chat or generate format
                content = ""
                if isinstance(data, dict):
                    if "message" in data and isinstance(data["message"], dict):
                        content = data["message"].get("content", "")
                    elif "response" in data:
                        content = data.get("response", "")

                return content.strip()

            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < self.max_retries:
                    self.sleep_fn(self.backoff_factor * (2 ** attempt))
                    continue
                raise LLMError(f"Ollama connection/timeout failure after {self.max_retries} retries: {exc}") from None

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    self.sleep_fn(self.backoff_factor * (2 ** attempt))
                    continue
                raise LLMError(f"Ollama HTTP error (status {exc.response.status_code}): {exc.response.text}") from None

            except Exception as exc:
                raise LLMError(f"Ollama generation failed: {exc}") from None

        raise LLMError(f"Ollama request failed after {self.max_retries} retries.")

    def __repr__(self) -> str:
        return f"OllamaLLMProvider(base_url={self.base_url!r}, model={self.model!r})"


def get_llm_provider(
    provider_name: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    ollama_url: str | None = None,
    timeout_seconds: float | None = None,
    **kwargs: Any,
) -> LLMProvider:
    """Factory creating the appropriate LLMProvider based on configuration or explicit name."""
    name = (provider_name or settings.llm_provider or "anthropic").strip().lower()
    timeout = timeout_seconds if timeout_seconds is not None else settings.llm_timeout_seconds
    model_name = model or settings.llm_model

    if name == "fake":
        return FakeLLMProvider(**kwargs)
    elif name == "ollama":
        url = ollama_url or settings.ollama_url
        return OllamaLLMProvider(base_url=url, model=model_name, timeout_seconds=timeout, **kwargs)
    elif name == "anthropic":
        key = api_key or settings.anthropic_api_key
        return AnthropicLLMProvider(api_key=key, model=model_name, timeout_seconds=timeout, **kwargs)
    else:
        raise LLMError(f"Unsupported LLM provider: '{name}'. Supported providers: 'anthropic', 'ollama', 'fake'.")


def generate(system: str, user: str, max_tokens: int = 1024, provider: LLMProvider | None = None) -> str:
    """
    Standard interface for LLM text generation.
    Usage: generate(system: str, user: str, max_tokens: int) -> str
    """
    active_provider = provider or get_llm_provider()
    return active_provider.generate(system=system, user=user, max_tokens=max_tokens)

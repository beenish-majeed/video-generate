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
    # Scrub common Bearer token formats
    sanitized = re.sub(r"(Bearer\s+)[a-zA-Z0-9_\.\-]+", r"\1[REDACTED_API_KEY]", sanitized)
    return sanitized


class LLMProvider(abc.ABC):
    """Abstract base provider for LLM text generation."""
    provider_name: str = "generic"

    @abc.abstractmethod
    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        """Generate text completion from system instructions and user input."""
        raise NotImplementedError


class FakeLLMProvider(LLMProvider):
    """
    Deterministic fake LLM provider for tests.
    Does not perform any network calls.
    """
    provider_name: str = "fake"

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

        # Default deterministic response: if a target length is requested in prompt, generate natural text
        import re
        target_match = re.search(r"around (\d+) words", user)
        if target_match:
            needed = int(target_match.group(1))
            sentence = "I remember walking along the quiet morning trail with peaceful thoughts in the gentle sunlight."
            words = []
            while len(words) < needed:
                words.extend(sentence.split())
            return (" ".join(words[:needed])).strip() + "."

        return f"[fake-llm] System: {system[:30]} | User: {user[:50]} (max_tokens: {max_tokens})"


class TemplateLLMProvider(LLMProvider):
    """
    Offline, rule-based narrative template provider.
    Requires no external LLM or network connection. Generates high-quality,
    first-person spoken narratives matching target word count and duration.
    """
    provider_name: str = "template"

    def __init__(self, **kwargs: Any):
        pass

    def _extract_topic(self, user: str) -> str:
        m = re.search(r"(?:Overall Topic|Topic):\s*(.+?)(?:\n|$)", user, re.IGNORECASE)
        if m:
            clean = m.group(1).strip()
            clean = re.sub(r"^(about|on|discussing)\s+", "", clean, flags=re.IGNORECASE)
            return clean.rstrip(".")
        return "this special memory"

    def _extract_target_words(self, user: str) -> int:
        m = re.search(r"(?:target length:\s*exactly around|around|expanded to)\s*(\d+)\s*words", user, re.IGNORECASE)
        if m:
            return int(m.group(1))
        return 74

    def _extract_tone(self, system: str) -> str:
        m = re.search(r"Tone of voice:\s*([a-zA-Z]+)", system, re.IGNORECASE)
        if m:
            return m.group(1).strip().lower()
        return "friendly"

    def generate(self, system: str, user: str, max_tokens: int = 1024) -> str:
        outline_match = re.search(r"(\d+)-part narrative outline", user, re.IGNORECASE)
        if outline_match:
            n = int(outline_match.group(1))
            topic = self._extract_topic(user)
            lines = []
            for i in range(1, n + 1):
                if i == 1:
                    lines.append(f"{i}. Opening reflections and introducing {topic}")
                elif i == n:
                    lines.append(f"{i}. Final thoughts and lasting perspective on {topic}")
                else:
                    lines.append(f"{i}. Memorable moments and meaningful lessons from {topic}")
            return "\n".join(lines)

        from src.services.template_script_writer import build_template_script
        target_words = self._extract_target_words(user)
        topic = self._extract_topic(user)
        tone = self._extract_tone(system)
        duration_seconds = (target_words / settings.words_per_minute) * 60.0
        return build_template_script(idea=topic, duration_seconds=duration_seconds, tone=tone)

    def __repr__(self) -> str:
        return "TemplateLLMProvider()"


class OllamaLLMProvider(LLMProvider):
    """
    Ollama local HTTP provider.
    Calls local Ollama endpoint (e.g. http://127.0.0.1:11434/api/chat) with retry on transient errors.
    """
    provider_name: str = "ollama"

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
        self.base_url = (base_url or settings.ollama_url or "http://127.0.0.1:11434").rstrip("/")
        self.model = model or settings.llm_model or "llama3.2:3b"
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


def is_ollama_reachable(
    base_url: str | None = None,
    timeout: float = 1.0,
    http_client: httpx.Client | None = None,
) -> bool:
    """Check if local Ollama server is running and responsive."""
    url = (base_url or settings.ollama_url or "http://127.0.0.1:11434").rstrip("/")
    try:
        if http_client is not None:
            resp = http_client.get(f"{url}/api/tags")
            return resp.status_code == 200 or resp.is_success
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(f"{url}/api/tags")
            return resp.status_code == 200 or resp.is_success
    except Exception:
        return False


def get_llm_provider(
    provider_name: str | None = None,
    model: str | None = None,
    ollama_url: str | None = None,
    timeout_seconds: float | None = None,
    **kwargs: Any,
) -> LLMProvider:
    """Factory creating the appropriate LLMProvider based on configuration or explicit name."""
    name = (provider_name or settings.llm_provider or "ollama").strip().lower()
    timeout = timeout_seconds if timeout_seconds is not None else settings.llm_timeout_seconds
    model_name = model or settings.llm_model

    if name == "fake":
        return FakeLLMProvider(**kwargs)
    elif name == "template":
        return TemplateLLMProvider(**kwargs)
    elif name == "ollama":
        url = ollama_url or settings.ollama_url
        return OllamaLLMProvider(base_url=url, model=model_name, timeout_seconds=timeout, **kwargs)
    else:
        raise LLMError(f"Unsupported LLM provider: '{name}'. Supported providers: 'ollama', 'template', 'fake'.")


def generate(system: str, user: str, max_tokens: int = 1024, provider: LLMProvider | None = None) -> str:
    """
    Standard interface for LLM text generation.
    Usage: generate(system: str, user: str, max_tokens: int) -> str
    """
    active_provider = provider or get_llm_provider()
    return active_provider.generate(system=system, user=user, max_tokens=max_tokens)

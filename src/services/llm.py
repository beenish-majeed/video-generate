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

        target_words = self._extract_target_words(user)
        topic = self._extract_topic(user)
        return self._generate_template_narrative(topic=topic, target_words=target_words)

    def _generate_template_narrative(self, topic: str, target_words: int) -> str:
        openings = [
            f"Whenever I pause to reflect on {topic}, a warm sense of gratitude and calm comes over me.",
            f"Looking back on {topic}, every single detail feels remarkably vivid, personal, and full of meaning.",
            f"I wanted to share a few quiet thoughts about {topic} and celebrate what it truly represents to me.",
            f"There is something truly unforgettable about {topic} that stays with me through every passing season.",
        ]

        body_pool = [
            f"From the very beginning, each moment on this path brought new lessons and unforgettable perspective.",
            f"We often move quickly through our days, but pausing to appreciate {topic} reminds me of what really matters.",
            f"The laughter, the quiet hours of focus, and the small victories along the way made every effort worthwhile.",
            f"It is the simple, heartfelt details that I cherish the most whenever I look back on this journey.",
            f"I remember feeling a profound sense of peace and joy as everything began coming together so naturally.",
            f"Every conversation, every little milestone, and every shared smile added a unique layer to the experience.",
            f"Standing here today, I can see how much personal growth and happiness came out of this chapter.",
            f"These moments are woven deeply into who I am, guiding me forward with genuine hope and purpose.",
            f"Taking the time to revisit {topic} gives me renewed energy and a deeper appreciation for the people around me.",
            f"The connections made and the hurdles overcome have left an indelible impression on my life.",
            f"Through every twist and turn, the authenticity and warmth of this experience remained constant and true.",
            f"I hold onto these lessons, knowing that each small step helped shape who I am today.",
            f"Life often surprises us in the most unexpected ways, and this experience was truly one of those moments.",
            f"The peaceful atmosphere and the quiet determination we shared still resonate within me every single day.",
            f"Looking closely at how things unfolded, I realize just how fortunate I was to experience every minute.",
        ]

        closings = [
            f"I am deeply thankful for every second of it, and I will carry these memories with me always.",
            f"Thank you for taking a moment to listen, and may these reflections bring warmth to your day.",
            f"As this chapter gently closes, the lessons and love from it will stay bright in my heart forever.",
            f"I will always treasure these memories and look forward to the future with an open heart.",
        ]

        finishers = {
            4: "I treasure this always.",
            5: "These memories will remain forever.",
            6: "I am grateful for every moment.",
            7: "These lessons will guide me forward always.",
            8: "I carry these heartfelt reflections with me daily.",
            9: "I am deeply thankful for every single moment shared.",
            10: "As this chapter closes, these memories will stay bright forever.",
            11: "Thank you for listening, and may these reflections bring warmth today.",
            12: "Looking forward, I carry the joy and inspiration of this journey always.",
        }

        if target_words <= 20:
            core_topic = topic
            topic_words = topic.split()
            if len(topic_words) > 4:
                core_topic = " ".join(topic_words[:4])
            short_templates = [
                f"I remember {core_topic} with peace.",
                f"Thinking about {core_topic} brings peace to my heart.",
                f"I truly treasure every moment with {core_topic}.",
                f"Reflecting on {core_topic} brings lasting joy and peace.",
                f"I hold memories of {core_topic} close to my heart.",
                f"I will always cherish {core_topic} with genuine gratitude.",
                f"Looking back on {core_topic} fills me with profound warmth and quiet gratitude.",
            ]
            best_short = min(short_templates, key=lambda s: abs(len(s.split()) - target_words))
            return best_short

        chosen_sentences: list[str] = [openings[0]]
        current_words = len(chosen_sentences[0].split())

        if current_words >= target_words:
            return chosen_sentences[0]

        body_idx = 0
        min_close_words = 16
        while body_idx < len(body_pool) and (current_words + len(body_pool[body_idx].split()) + min_close_words <= target_words):
            chosen_sentences.append(body_pool[body_idx])
            current_words += len(body_pool[body_idx].split())
            body_idx += 1

        while current_words + 16 + min_close_words <= target_words:
            s = body_pool[body_idx % len(body_pool)]
            chosen_sentences.append(s)
            current_words += len(s.split())
            body_idx += 1

        remaining = target_words - current_words
        if remaining in finishers:
            chosen_sentences.append(finishers[remaining])
        elif remaining >= 15:
            best_closing = min(closings, key=lambda c: abs(len(c.split()) - remaining))
            chosen_sentences.append(best_closing)
            current_words += len(best_closing.split())
            remaining = target_words - current_words
            if remaining in finishers:
                chosen_sentences.append(finishers[remaining])
        elif remaining >= 4:
            closest_k = min(finishers.keys(), key=lambda k: abs(k - remaining))
            chosen_sentences.append(finishers[closest_k])

        return " ".join(chosen_sentences)

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

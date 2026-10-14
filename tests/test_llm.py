from unittest.mock import MagicMock
import httpx
import pytest

from src.services.llm import (
    FakeLLMProvider,
    LLMError,
    OllamaLLMProvider,
    TemplateLLMProvider,
    _sanitize_message,
    generate,
    get_llm_provider,
    is_ollama_reachable,
)


class TestFakeLLMProvider:
    def test_default_deterministic_response(self):
        provider = FakeLLMProvider()
        result = provider.generate(
            system="You are a poetic assistant.",
            user="Describe a gentle summer rain.",
            max_tokens=256,
        )
        assert "[fake-llm]" in result
        assert "You are a poetic assistant." in result
        assert "Describe a gentle summer rain." in result
        assert "max_tokens: 256" in result
        assert len(provider.call_history) == 1
        assert provider.call_history[0]["max_tokens"] == 256

    def test_canned_response(self):
        provider = FakeLLMProvider(canned_response="A soft pitter-patter upon green leaves.")
        result = provider.generate(system="sys", user="user")
        assert result == "A soft pitter-patter upon green leaves."

    def test_response_generator_callback(self):
        def custom_gen(system: str, user: str, max_tokens: int) -> str:
            return f"Echo: {user.upper()}"

        provider = FakeLLMProvider(response_generator=custom_gen)
        result = provider.generate(system="sys", user="hello world")
        assert result == "Echo: HELLO WORLD"

    def test_error_to_raise(self):
        provider = FakeLLMProvider(error_to_raise=LLMError("Simulated provider outage"))
        with pytest.raises(LLMError, match="Simulated provider outage"):
            provider.generate(system="sys", user="user")

    def test_top_level_generate_with_fake_provider(self):
        fake = FakeLLMProvider(canned_response="Direct generate test")
        res = generate(system="sys", user="user", max_tokens=100, provider=fake)
        assert res == "Direct generate test"


class TestLLMFactory:
    def test_get_fake_provider(self):
        provider = get_llm_provider("fake")
        assert isinstance(provider, FakeLLMProvider)
        assert provider.provider_name == "fake"

    def test_get_template_provider(self):
        provider = get_llm_provider("template")
        assert isinstance(provider, TemplateLLMProvider)
        assert provider.provider_name == "template"

    def test_get_ollama_provider(self):
        provider = get_llm_provider("ollama", ollama_url="http://127.0.0.1:11434")
        assert isinstance(provider, OllamaLLMProvider)
        assert provider.base_url == "http://127.0.0.1:11434"
        assert provider.provider_name == "ollama"

    def test_unsupported_provider_raises_llm_error(self):
        with pytest.raises(LLMError, match="Unsupported LLM provider: 'anthropic'"):
            get_llm_provider("anthropic")
        with pytest.raises(LLMError, match="Unsupported LLM provider: 'unknown'"):
            get_llm_provider("unknown")


class TestTemplateProvider:
    def test_generate_narrative_with_target_words(self):
        provider = TemplateLLMProvider()
        user_prompt = "Topic: A quiet walk through autumn woods\nTarget length: exactly around 74 words."
        result = provider.generate(system="You are a first-person narrator", user=user_prompt)

        words = result.split()
        assert 70 <= len(words) <= 78
        assert "walk through autumn woods" in result
        assert "#" not in result
        assert "[" not in result
        assert "]" not in result

    def test_generate_narrative_with_longer_target(self):
        provider = TemplateLLMProvider()
        user_prompt = "Topic: Building a treehouse with my family\nTarget length: exactly around 148 words."
        result = provider.generate(system="System instructions", user=user_prompt)

        words = result.split()
        assert 140 <= len(words) <= 156
        assert "Building a treehouse with my family" in result or "treehouse" in result

    def test_generate_outline(self):
        provider = TemplateLLMProvider()
        user_prompt = "Topic: My childhood hometown\nCreate a brief 3-part narrative outline for a spoken memory video."
        result = provider.generate(system="System", user=user_prompt)

        lines = [line.strip() for line in result.splitlines() if line.strip()]
        assert len(lines) == 3
        assert lines[0].startswith("1.")
        assert lines[1].startswith("2.")
        assert lines[2].startswith("3.")
        assert "childhood hometown" in result

    def test_template_repr(self):
        provider = TemplateLLMProvider()
        assert repr(provider) == "TemplateLLMProvider()"


class TestOllamaProviderMocked:
    def test_successful_ollama_generation(self):
        mock_http = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "message": {"role": "assistant", "content": "Ollama generated memory narrative."}
        }
        mock_http.post.return_value = mock_resp

        provider = OllamaLLMProvider(
            base_url="http://localhost:11434",
            model="llama3.2",
            http_client=mock_http,
        )

        result = provider.generate(system="sys", user="user", max_tokens=200)
        assert result == "Ollama generated memory narrative."
        mock_http.post.assert_called_once()
        call_kwargs = mock_http.post.call_args[1]
        assert call_kwargs["json"]["model"] == "llama3.2"
        assert call_kwargs["json"]["options"]["num_predict"] == 200

    def test_ollama_timeout_retry_and_success(self):
        mock_http = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"message": {"content": "Succeeded on retry"}}

        timeout_err = httpx.TimeoutException("Connection timed out to Ollama host")
        mock_http.post.side_effect = [timeout_err, mock_resp]

        sleep_calls = []
        provider = OllamaLLMProvider(
            base_url="http://localhost:11434",
            http_client=mock_http,
            backoff_factor=0.05,
            sleep_fn=sleep_calls.append,
        )

        result = provider.generate(system="sys", user="user")
        assert result == "Succeeded on retry"
        assert mock_http.post.call_count == 2
        assert len(sleep_calls) == 1

    def test_ollama_exhaustion_raises_llm_error(self):
        mock_http = MagicMock()
        timeout_err = httpx.ConnectError("Could not connect to localhost:11434")
        mock_http.post.side_effect = timeout_err

        sleep_calls = []
        provider = OllamaLLMProvider(
            base_url="http://localhost:11434",
            max_retries=2,
            http_client=mock_http,
            backoff_factor=0.01,
            sleep_fn=sleep_calls.append,
        )

        with pytest.raises(LLMError, match="Ollama connection/timeout failure after 2 retries"):
            provider.generate(system="sys", user="user")

        assert mock_http.post.call_count == 3
        assert len(sleep_calls) == 2

    def test_is_ollama_reachable_true(self):
        mock_http = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_success = True
        mock_http.get.return_value = mock_resp

        assert is_ollama_reachable("http://127.0.0.1:11434", http_client=mock_http) is True
        mock_http.get.assert_called_once_with("http://127.0.0.1:11434/api/tags")

    def test_is_ollama_reachable_false_on_connection_error(self):
        mock_http = MagicMock()
        mock_http.get.side_effect = httpx.ConnectError("Connection refused")

        assert is_ollama_reachable("http://127.0.0.1:11434", http_client=mock_http) is False


class TestSecurityAndKeySanitization:
    def test_bearer_token_and_secret_scrubbed_from_error_messages(self):
        secret = "super-secret-key-1234567890"
        leak_attempt = f"Failed calling provider with key={secret} and auth Bearer eyJhbGciOi12345"
        sanitized = _sanitize_message(leak_attempt, secret_key=secret)

        assert secret not in sanitized
        assert "eyJhbGciOi12345" not in sanitized
        assert "[REDACTED_API_KEY]" in sanitized

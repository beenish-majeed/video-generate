from unittest.mock import MagicMock
import httpx
import pytest

from src.services.llm import (
    AnthropicLLMProvider,
    FakeLLMProvider,
    LLMError,
    OllamaLLMProvider,
    _sanitize_message,
    generate,
    get_llm_provider,
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

    def test_get_anthropic_provider(self):
        provider = get_llm_provider("anthropic", api_key="test-key", model="claude-3-haiku")
        assert isinstance(provider, AnthropicLLMProvider)
        assert provider.model == "claude-3-haiku"

    def test_get_ollama_provider(self):
        provider = get_llm_provider("ollama", ollama_url="http://127.0.0.1:11434")
        assert isinstance(provider, OllamaLLMProvider)
        assert provider.base_url == "http://127.0.0.1:11434"

    def test_unsupported_provider_raises_llm_error(self):
        with pytest.raises(LLMError, match="Unsupported LLM provider: 'unknown'"):
            get_llm_provider("unknown")


class TestAnthropicProviderMocked:
    def test_missing_api_key_raises_llm_error(self):
        provider = AnthropicLLMProvider(api_key=None)
        # Ensure setting has no key for this test
        provider.api_key = ""
        with pytest.raises(LLMError, match="Anthropic API key is not configured"):
            provider.generate(system="sys", user="user")

    def test_successful_generation(self):
        mock_client = MagicMock()
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "Golden sunlight filtered softly through the pine needles."
        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create.return_value = mock_response

        provider = AnthropicLLMProvider(
            api_key="test-key-123",
            model="claude-haiku-4-5-20251001",
            client=mock_client,
        )

        result = provider.generate(
            system="Write a memory scene.",
            user="Pine forest in the morning.",
            max_tokens=500,
        )

        assert result == "Golden sunlight filtered softly through the pine needles."
        mock_client.messages.create.assert_called_once_with(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system="Write a memory scene.",
            messages=[{"role": "user", "content": "Pine forest in the morning."}],
        )

    def test_rate_limit_transient_retry_and_success(self):
        import anthropic

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "Recovered response after rate limit backoff."
        mock_response.content = [mock_block]

        # RateLimitError requires a message, response, and body
        fake_http_response = httpx.Response(status_code=429, request=httpx.Request("POST", "https://api.anthropic.com"))
        rate_limit_err = anthropic.RateLimitError(
            message="Rate limit exceeded",
            response=fake_http_response,
            body={"error": {"message": "Rate limit exceeded"}},
        )

        # Fail once with rate limit, then succeed
        mock_client.messages.create.side_effect = [rate_limit_err, mock_response]

        sleep_calls = []
        provider = AnthropicLLMProvider(
            api_key="test-key-123",
            client=mock_client,
            backoff_factor=0.1,
            sleep_fn=sleep_calls.append,
        )

        result = provider.generate(system="sys", user="user")
        assert result == "Recovered response after rate limit backoff."
        assert mock_client.messages.create.call_count == 2
        assert len(sleep_calls) == 1

    def test_timeout_exhaustion_raises_llm_error(self):
        import anthropic

        mock_client = MagicMock()
        fake_req = httpx.Request("POST", "https://api.anthropic.com")
        timeout_err = anthropic.APITimeoutError(request=fake_req)

        mock_client.messages.create.side_effect = timeout_err

        sleep_calls = []
        provider = AnthropicLLMProvider(
            api_key="test-key-123",
            max_retries=2,
            client=mock_client,
            backoff_factor=0.1,
            sleep_fn=sleep_calls.append,
        )

        with pytest.raises(LLMError, match="Anthropic transient failure after 2 retries"):
            provider.generate(system="sys", user="user")

        # Initial attempt + 2 retries = 3 attempts total
        assert mock_client.messages.create.call_count == 3
        assert len(sleep_calls) == 2

    def test_non_transient_auth_error_fails_immediately_without_retry(self):
        import anthropic

        mock_client = MagicMock()
        fake_http_resp = httpx.Response(status_code=401, request=httpx.Request("POST", "https://api.anthropic.com"))
        auth_err = anthropic.AuthenticationError(
            message="Invalid API Key provided",
            response=fake_http_resp,
            body={"error": {"message": "Invalid API Key provided"}},
        )

        mock_client.messages.create.side_effect = auth_err

        sleep_calls = []
        provider = AnthropicLLMProvider(
            api_key="test-key-invalid",
            client=mock_client,
            sleep_fn=sleep_calls.append,
        )

        with pytest.raises(LLMError, match="status 401"):
            provider.generate(system="sys", user="user")

        # Fails on first attempt without retrying
        assert mock_client.messages.create.call_count == 1
        assert len(sleep_calls) == 0


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


class TestSecurityAndKeySanitization:
    def test_api_key_is_scrubbed_from_error_messages(self):
        secret = "sk-ant-api03-my-super-secret-key-1234567890"
        leak_attempt = f"Failed calling provider with key={secret} and auth Bearer eyJhbGciOi"
        sanitized = _sanitize_message(leak_attempt, secret_key=secret)

        assert secret not in sanitized
        assert "[REDACTED_API_KEY]" in sanitized

    def test_anthropic_error_never_exposes_key(self):
        import anthropic

        mock_client = MagicMock()
        secret = "sk-ant-api03-super-secret-key-abcdef"
        fake_http_resp = httpx.Response(status_code=400, request=httpx.Request("POST", "https://api.anthropic.com"))
        err_with_secret = anthropic.BadRequestError(
            message=f"Invalid payload for key {secret}",
            response=fake_http_resp,
            body={"error": {"message": f"Bad key {secret}"}},
        )
        mock_client.messages.create.side_effect = err_with_secret

        provider = AnthropicLLMProvider(api_key=secret, client=mock_client)

        with pytest.raises(LLMError) as exc_info:
            provider.generate(system="sys", user="user")

        error_str = str(exc_info.value)
        assert secret not in error_str
        assert "[REDACTED_API_KEY]" in error_str

    def test_repr_does_not_reveal_key(self):
        provider = AnthropicLLMProvider(api_key="sk-ant-api03-super-secret-key-abcdef")
        rep = repr(provider)
        assert "sk-ant" not in rep
        assert "super-secret" not in rep

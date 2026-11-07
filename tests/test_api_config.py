import pytest
from src.core.api_config import FileAIConfig
from src.core.config import Settings


def test_file_ai_config_defaults():
    cfg = FileAIConfig()
    assert not cfg.is_configured
    headers = cfg.get_headers()
    assert "Authorization" not in headers
    assert headers["Content-Type"] == "application/json"


def test_file_ai_config_with_key():
    cfg = FileAIConfig(api_key="sk_live_fileai_9876543210abcdef")
    assert cfg.is_configured
    headers = cfg.get_headers()
    assert headers["Authorization"] == "Bearer sk_live_fileai_9876543210abcdef"


def test_file_ai_config_placeholders_rejected():
    for placeholder in ["", "   ", "your_file_ai_api_key_here", "placeholder", "short"]:
        cfg = FileAIConfig(api_key=placeholder)
        assert not cfg.is_configured
        assert "Authorization" not in cfg.get_headers()


def test_settings_get_file_ai_config():
    s = Settings(file_ai_api_key="sk_test_12345678")
    cfg = s.get_file_ai_config()
    assert cfg.api_key == "sk_test_12345678"
    assert cfg.is_configured

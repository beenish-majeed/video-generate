"""
Backward compatibility proxy module for application settings.
Canonical configuration is located in src.core.config.
"""
from src.core.config import Settings, settings

__all__ = ["Settings", "settings"]

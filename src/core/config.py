from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

from src.core.api_config import (
    DEFAULT_FILE_AI_API_KEY,
    DEFAULT_FILE_AI_BASE_URL,
    DEFAULT_FILE_AI_TIMEOUT_SECONDS,
    DEFAULT_FILE_AI_MAX_RETRIES,
    FileAIConfig,
)


class Settings(BaseSettings):
    """
    Modernized API-Based Backend Settings.
    Supports environment variables from `.env` and defaults.
    """
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Storage Paths
    storage_dir: Path = Path("./storage")
    db_filename: str = "app.db"

    # Server Authentication & Security
    api_key: Optional[str] = None
    allow_insecure_dev: bool = False
    jwt_secret: str = "insecure_dev_jwt_secret_change_in_production_min32chars"

    # File.ai API Configuration
    file_ai_api_key: str = Field(default=DEFAULT_FILE_AI_API_KEY)
    file_ai_base_url: str = Field(default=DEFAULT_FILE_AI_BASE_URL)
    file_ai_timeout_seconds: float = Field(default=DEFAULT_FILE_AI_TIMEOUT_SECONDS)
    file_ai_max_retries: int = Field(default=DEFAULT_FILE_AI_MAX_RETRIES)
    file_ai_mock_fallback: bool = True

    # Media & Processing Boundaries
    min_duration_seconds: float = 1.0
    max_duration_policy_seconds: float = 900.0
    words_per_minute: float = 148.0
    sample_rate: int = 16000
    default_fps: int = 30
    default_resolution: str = "1280x720"
    allow_burn_subtitles: bool = True

    # Request Body & Upload Limits (Per-Route)
    max_request_body_bytes: int = 55 * 1024 * 1024       # 55 MB for general routes
    max_clip_request_body_bytes: int = 215 * 1024 * 1024 # 215 MB for video clip uploads
    max_voice_duration_seconds: float = 300.0
    max_image_width: int = 4096
    max_image_height: int = 4096
    max_image_pixels: int = 16_777_216

    # Video Clip Constraints
    max_clip_size_bytes: int = 200 * 1024 * 1024
    max_clips_per_job: int = 60
    max_clip_duration_seconds: float = 30.0
    max_clip_width: int = 1920
    max_clip_height: int = 1080
    max_clip_fps: float = 60.0

    # Rate Limiting & Concurrency
    max_active_jobs_cap: int = 16
    script_rate_limit_per_minute: int = 10
    upload_rate_limit_per_minute: int = 30
    job_create_rate_limit_per_minute: int = 10

    # Storage Retention
    asset_retention_hours: float = 72.0
    job_retention_hours: float = 48.0
    failed_job_retention_hours: float = 24.0
    total_storage_max_bytes: int = 10 * 1024 * 1024 * 1024  # 10 GB

    # External Binaries & Subprocess Timeouts
    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"
    subprocess_default_timeout_seconds: float = 120.0
    subprocess_ffprobe_timeout_seconds: float = 15.0
    subprocess_render_timeout_seconds: float = 600.0

    @property
    def db_path(self) -> Path:
        return self.storage_dir / self.db_filename

    @property
    def assets_dir(self) -> Path:
        p = self.storage_dir / "assets"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def jobs_dir(self) -> Path:
        p = self.storage_dir / "jobs"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_file_ai_config(self) -> FileAIConfig:
        return FileAIConfig(
            api_key=self.file_ai_api_key,
            base_url=self.file_ai_base_url,
            timeout_seconds=self.file_ai_timeout_seconds,
            max_retries=self.file_ai_max_retries,
            mock_fallback_enabled=self.file_ai_mock_fallback,
        )


settings = Settings()

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    storage_dir: Path = Path("./storage")

    max_duration_policy_seconds: float = 3600.0
    min_duration_seconds: float = 1.0

    mock_mode: bool = True

    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"

    default_fps: int = 30
    default_resolution: str = "1280x720"

    max_segment_seconds: float = 10.0
    sample_rate: int = 24000

    allow_burn_subtitles: bool = False


settings = Settings()
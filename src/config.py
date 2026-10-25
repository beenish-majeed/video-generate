from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    storage_dir: Path = Path("./storage")
    max_duration_policy_seconds: float = 900.0

    min_duration_seconds: float = 1.0
    mock_mode: bool = False  # Changed default to False

    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"

    default_fps: int = 25
    default_resolution: str = "720x720"
    max_segment_seconds: float = 5.0
    sample_rate: int = 22050
    allow_burn_subtitles: bool = True
    words_per_minute: float = 148.0
    failed_job_retention_hours: float = 24.0
    allow_insecure_dev: bool = False
    api_key: str | None = None

    # Subprocess Timeouts
    subprocess_default_timeout_seconds: float = 120.0
    subprocess_ffprobe_timeout_seconds: float = 15.0
    subprocess_render_timeout_seconds: float = 600.0
    subprocess_piper_timeout_seconds: float = 60.0

    # Upload Media Bounds
    max_voice_duration_seconds: float = 300.0
    max_image_width: int = 4096
    max_image_height: int = 4096
    max_image_pixels: int = 16_777_216
    max_request_body_bytes: int = 55 * 1024 * 1024



    # LLM Provider Configs
    llm_provider: str = "ollama"
    llm_model: str = "llama3.2:3b"
    ollama_url: str = "http://127.0.0.1:11434"
    llm_timeout_seconds: float = 60.0

    tts_provider: str = "piper"
    cosyvoice_model_path: str = "models/cosyvoice/CosyVoice2-0.5B"

    # Image Provider Configs
    image_provider: str = "diffusers"
    image_style: str = "cinematic"
    sd_turbo_model_path: str = "models/sd-turbo"
    image_cache_dir: Path = Path("./storage/cache/images")

    # Model Configs
    piper_model_path: str = "src/models/piper/en_US-lessac-medium.onnx"
    piper_config_path: str = "src/models/piper/en_US-lessac-medium.onnx.json"
    wav2lip_ckpt_path: str = "src/models/wav2lip/wav2lip.pth"
    wav2lip_repo_path: str = "./external/wav2lip"


settings = Settings()
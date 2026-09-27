from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    storage_dir: Path = Path("./storage")
    max_duration_policy_seconds: float = 3600.0
    min_duration_seconds: float = 1.0
    mock_mode: bool = False  # Changed default to False

    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"

    default_fps: int = 25
    default_resolution: str = "720x720"
    max_segment_seconds: float = 5.0
    sample_rate: int = 22050

    # Model Configs
    piper_model_path: str = "./models/piper/en_US-lessac-medium.onnx"
    piper_config_path: str = "./models/piper/en_US-lessac-medium.onnx.json"
    wav2lip_ckpt_path: str = "./models/wav2lip/checkpoint_v2.pt"
    wav2lip_repo_path: str = "./external/wav2lip"


settings = Settings()
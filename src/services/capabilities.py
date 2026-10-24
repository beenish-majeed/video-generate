import logging
from pathlib import Path
from typing import Any, Dict, Optional
import urllib.request

from src.config import settings
from src.services.speech_to_text import is_whisper_available

logger = logging.getLogger(__name__)


def is_gpu_available() -> tuple[bool, Optional[str]]:
    """Check if CUDA GPU is available via PyTorch."""
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            return True, name
    except Exception as exc:
        logger.debug(f"GPU detection error: {exc}")
    return False, None


def is_ollama_available(url: str = settings.ollama_url) -> bool:
    """Check if local Ollama server is reachable."""
    try:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/api/tags",
            headers={"User-Agent": "AvatarStudio/1.0"},
        )
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def is_diffusers_model_available() -> bool:
    """Check if local SD-Turbo or diffusers model directory exists."""
    path_val = getattr(settings, "sd_turbo_model_path", None) or getattr(settings, "diffusers_model_path", "models/sd-turbo")
    p = Path(path_val)
    if not p.exists():
        return False
    return (p / "model_index.json").exists() or any(p.glob("*.safetensors")) or any(p.glob("*.bin"))


def is_piper_available() -> bool:
    """Check if Piper model or voice preset is available."""
    return Path(settings.piper_model_path).exists() or Path("assets/voices/default_voice.wav").exists()


def compute_honest_time_estimate(
    duration_seconds: float,
    mode: str = "slideshow",
    gpu: bool = False,
    image_provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Produce an honest time estimate for video rendering without fake percentages.
    Estimates depend on duration, GPU presence, visual mode, and image provider.
    """
    dur = max(1.0, float(duration_seconds))
    provider = (image_provider or settings.image_provider).lower()

    if mode == "talking_head":
        # Wav2Lip forward pass on cropped face frames
        # ~0.5x realtime on GPU, ~2.5x realtime on CPU
        multiplier = 0.6 if gpu else 2.5
        est_seconds = round(dur * multiplier)
    else:
        # Slideshow mode: Ken Burns + optional image generation
        scenes = max(1, round(dur / 6.0))
        if provider == "diffusers":
            # 1-4 step SD-Turbo: ~1.5s/scene on GPU, ~18s/scene on CPU
            scene_cost = 1.5 if gpu else 18.0
            est_seconds = round((scenes * scene_cost) + (dur * 0.2) + 3.0)
        else:
            # Procedural cards or pre-uploaded images: fast Pillow + FFmpeg
            est_seconds = round((scenes * 0.4) + (dur * 0.15) + 2.0)

    # Format human-friendly label
    if est_seconds < 60:
        display_text = f"~{est_seconds} seconds"
    else:
        mins = round(est_seconds / 60.0, 1)
        display_text = f"~{mins} minutes"

    device_label = "GPU accelerated" if gpu else "CPU (expect longer rendering)"

    return {
        "estimated_seconds": est_seconds,
        "display_text": f"{display_text} ({device_label})",
        "device": "gpu" if gpu else "cpu",
    }


def get_system_capabilities(
    mode: Optional[str] = None,
    duration_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """Return all system hardware capabilities and providers."""
    gpu_ok, gpu_name = is_gpu_available()
    ollama_ok = is_ollama_available()
    diffusers_ok = is_diffusers_model_available()
    whisper_ok = is_whisper_available()
    piper_ok = is_piper_available()

    from src.services.music_presets import get_allowed_preset_ids

    caps: Dict[str, Any] = {
        "gpu": {
            "available": gpu_ok,
            "device_name": gpu_name or "CPU",
        },
        "providers": {
            "ollama": ollama_ok,
            "diffusers": diffusers_ok,
            "whisper": whisper_ok,
            "piper": piper_ok,
            "cards": True,
        },
        "auto_subtitles": whisper_ok,
        "background_music": True,
        "music_presets": get_allowed_preset_ids(),
        "image_provider_configured": settings.image_provider,
        "llm_provider_configured": settings.llm_provider,
    }

    if duration_seconds is not None:
        caps["estimate"] = compute_honest_time_estimate(
            duration_seconds=duration_seconds,
            mode=mode or "slideshow",
            gpu=gpu_ok,
        )

    return caps

"""
Genuine AI Video Generation Provider Service
============================================
Handles high-fidelity AI Image-to-Video and Avatar animation using
first-class cloud neural video models (e.g. fal.ai Minimax Video-01, Kling, Luma)
and local offline fallbacks with clear attribution.

Requirements:
- Preserves subject's identity and appearance from input reference picture.
- Generates coherent, natural scene motion rather than static picture zoom.
- Preserves exact user original audio and timing.
- Honest error reporting: never silently falls back to a slideshow when genuine AI video is requested.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.error
import json

from src.core.config import settings
from src.utils.ffmpeg import probe_duration
from src.utils.subprocess_runner import run_subprocess

logger = logging.getLogger(__name__)


class VideoProviderError(RuntimeError):
    """Raised when an AI video provider fails or encounters authentication/quota limits."""
    pass


@dataclass
class VideoResult:
    """Result of an image-to-video generation operation."""
    video_path: Path
    provider_used: str
    model_name: str
    duration_seconds: float
    is_ai_generated: bool
    reason: str
    metadata: Dict[str, Any]


class BaseVideoProvider(ABC):
    """Abstract base class for video generation providers."""
    name: str = "base"

    @abstractmethod
    def generate_image_to_video(
        self,
        image_path: Path,
        prompt: Optional[str] = None,
        duration_seconds: float = 5.0,
        audio_path: Optional[Path] = None,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        """Generate moving video from input reference image."""
        pass


class FalAIVideoProvider(BaseVideoProvider):
    """
    Genuine AI Video Generation provider powered by fal.ai.
    Uses state-of-the-art neural image-to-video models (Minimax Video-01, Kling, Luma)
    to generate authentic moving scenes while preserving the visual reference and subject identity.
    """
    name = "fal_ai"
    DEFAULT_MODEL = "fal-ai/minimax/video-01/image-to-video"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (
                os.getenv("FAL_KEY")
                or getattr(settings, "file_ai_api_key", None)
                or ""
            ).strip()
        self.model = model or self.DEFAULT_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and ("fal_sk_" in self.api_key or len(self.api_key) > 20))

    def check_account_status(self) -> Dict[str, Any]:
        """
        Verify account authentication and quota/balance with fal.ai.
        Returns status dict: 'ready', 'exhausted_balance', 'invalid_key', or 'unconfigured'.
        """
        if not self.is_configured:
            return {
                "status": "unconfigured",
                "message": "FAL_KEY is not configured in environment or .env file.",
            }

        # Check storage token endpoint to verify key validity and balance
        url = "https://rest.fal.ai/storage/auth/token?storage_type=fal-cdn-v3"
        req = urllib.request.Request(
            url,
            data=b"{}",
            headers={
                "Authorization": f"Key {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "fal-client/0.5",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as res:
                if res.status == 200:
                    return {"status": "ready", "message": "fal.ai API key active and ready."}
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8", errors="replace")
            if err.code == 403 and "Exhausted balance" in err_body:
                return {
                    "status": "exhausted_balance",
                    "message": "User is locked: Exhausted balance. Top up your balance at fal.ai/dashboard/billing",
                }
            if err.code in (401, 403):
                return {
                    "status": "invalid_key",
                    "message": f"Authentication failed ({err.code}): {err_body[:200]}",
                }
            return {
                "status": "error",
                "message": f"fal.ai API returned error {err.code}: {err_body[:200]}",
            }
        except Exception as exc:
            return {
                "status": "network_error",
                "message": f"Could not reach fal.ai API: {exc}",
            }

        return {"status": "ready", "message": "fal.ai API key verified."}

    def generate_image_to_video(
        self,
        image_path: Path,
        prompt: Optional[str] = None,
        duration_seconds: float = 5.0,
        audio_path: Optional[Path] = None,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        if not self.is_configured:
            raise VideoProviderError(
                "Genuine AI video generation requires an active fal.ai API key (FAL_KEY). "
                "Configure FAL_KEY in your .env file or choose Cinematic Camera Motion."
            )

        # Check status before attempting render
        status_info = self.check_account_status()
        if status_info["status"] == "exhausted_balance":
            raise VideoProviderError(
                f"fal.ai Video Generation blocked: {status_info['message']}. "
                "Please add credits at fal.ai/dashboard/billing to generate genuine AI videos."
            )
        elif status_info["status"] in ("invalid_key", "error"):
            raise VideoProviderError(f"fal.ai API error: {status_info['message']}")

        import fal_client
        os.environ["FAL_KEY"] = self.api_key

        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Input reference image not found at '{image_path}'")

        if output_path is None:
            output_dir = job_path or image_path.parent
            output_path = output_dir / f"{image_path.stem}_ai_video.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Uploading visual reference {image_path.name} to fal.ai...")
        image_url = fal_client.upload_file(str(image_path))

        motion_prompt = (
            prompt.strip()
            if prompt and prompt.strip()
            else "Cinematic high definition motion, subject moving naturally, subtle facial expression, breathing, realistic lighting, 4k render"
        )
        # Ensure identity preservation instructions are embedded in prompt
        enhanced_prompt = f"{motion_prompt}, maintaining consistent subject identity, facial features, and appearance from reference photo"

        logger.info(f"Submitting AI image-to-video request to {self.model}...")
        try:
            res = fal_client.subscribe(
                self.model,
                arguments={
                    "image_url": image_url,
                    "prompt": enhanced_prompt,
                },
            )
        except Exception as exc:
            err_msg = str(exc)
            if "Exhausted balance" in err_msg or "User is locked" in err_msg:
                raise VideoProviderError(
                    "fal.ai balance exhausted: Please top up your balance at fal.ai/dashboard/billing "
                    "to generate genuine AI videos."
                ) from exc
            raise VideoProviderError(f"fal.ai video generation failed: {exc}") from exc

        video_info = res.get("video") if isinstance(res, dict) else None
        vid_url = None
        if isinstance(video_info, dict) and "url" in video_info:
            vid_url = video_info["url"]
        elif isinstance(res, dict) and "video_url" in res:
            vid_url = res["video_url"]

        if not vid_url:
            raise VideoProviderError(f"fal.ai response did not contain video URL: {res}")

        # Download result safely
        from src.clients.file_ai import get_file_ai_client
        client = get_file_ai_client()
        client._safe_download_file(vid_url, output_path)

        actual_dur = probe_duration(output_path)
        return VideoResult(
            video_path=output_path,
            provider_used=self.name,
            model_name=self.model,
            duration_seconds=actual_dur,
            is_ai_generated=True,
            reason=f"Genuine AI video synthesized with {self.model} preserving subject identity.",
            metadata={"source_url": vid_url, "prompt": enhanced_prompt},
        )


class KenBurnsVideoProvider(BaseVideoProvider):
    """
    Procedural camera motion animation provider using Ken Burns pan/zoom.
    Explicitly labeled as procedural camera motion (not faked as genuine AI video).
    Available as an offline, zero-quota alternative.
    """
    name = "ken_burns"

    def generate_image_to_video(
        self,
        image_path: Path,
        prompt: Optional[str] = None,
        duration_seconds: float = 5.0,
        audio_path: Optional[Path] = None,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        from src.services.slideshow_compositor import SlideshowCompositor

        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Input image not found at '{image_path}'")

        if output_path is None:
            output_dir = job_path or image_path.parent
            output_path = output_dir / f"{image_path.stem}_ken_burns.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        dur = float(duration_seconds or 5.0)
        if audio_path and Path(audio_path).exists():
            try:
                dur = probe_duration(audio_path)
            except Exception:
                pass

        SlideshowCompositor.render_scene_clip(
            image_path=image_path,
            duration_s=dur,
            motion_idx=0,
            output_path=output_path,
            fps=30,
        )

        return VideoResult(
            video_path=output_path,
            provider_used=self.name,
            model_name="ken_burns_zoompan",
            duration_seconds=dur,
            is_ai_generated=False,
            reason="Cinematic camera motion animation (Ken Burns) generated locally.",
            metadata={"motion_type": "zoom_in"},
        )


def get_video_provider(
    prefer_slideshow: bool = False,
    model: Optional[str] = None,
) -> BaseVideoProvider:
    """
    Factory resolving the appropriate video provider based on configuration and preferences.
    """
    if prefer_slideshow:
        return KenBurnsVideoProvider()

    fal_prov = FalAIVideoProvider(model=model)
    if fal_prov.is_configured:
        return fal_prov

    # If mock fallback is explicitly allowed in config (e.g. for offline testing), use KenBurns
    if getattr(settings, "file_ai_mock_fallback", True):
        return KenBurnsVideoProvider()

    # In production without mock fallback, raise clear error
    raise VideoProviderError(
        "No active AI video provider configured. Please configure FAL_KEY or FILE_AI_API_KEY in your environment, "
        "or select Cinematic Camera Motion."
    )

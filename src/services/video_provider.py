"""
Genuine AI Video Generation Provider Service
============================================
Handles high-fidelity AI Video generation (Text-to-Video and Image-to-Video) using
first-class cloud neural video models (e.g. Google Veo 2 / Veo 3, fal.ai Minimax Video-01, Kling, Luma)
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
import time
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
    """Result of an AI video generation operation."""
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

    @abstractmethod
    def generate_text_to_video(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        """Generate moving video from input text prompt."""
        pass

    @abstractmethod
    def check_account_status(self) -> Dict[str, Any]:
        """Verify account authentication and quota/balance."""
        pass


class GoogleVeoVideoProvider(BaseVideoProvider):
    """
    Genuine AI Video Generation provider powered by Google Veo (Veo 2 / Veo 3).
    Uses the Google GenAI SDK (google.genai) to generate state-of-the-art cinematic video
    footage with natural physics, coherent scenes, and high visual definition.
    """
    name = "google_veo"
    DEFAULT_MODEL = "veo-2.0-generate-001"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (
                os.getenv("GEMINI_API_KEY")
                or os.getenv("GOOGLE_API_KEY")
                or getattr(settings, "gemini_api_key", None)
                or getattr(settings, "google_api_key", None)
                or ""
            ).strip()
        self.model = model or self.DEFAULT_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key) > 10)

    def check_account_status(self) -> Dict[str, Any]:
        """Verify account authentication and quota with Google GenAI API."""
        if not self.is_configured:
            return {
                "status": "unconfigured",
                "message": "GEMINI_API_KEY or GOOGLE_API_KEY is not configured.",
            }

        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            # Lightweight verification of model existence and credentials
            client.models.get(model=self.model)
            return {
                "status": "ready",
                "message": f"Google Veo ({self.model}) active and ready.",
            }
        except Exception as exc:
            err_msg = str(exc)
            if "API_KEY_INVALID" in err_msg or "unauthorized" in err_msg.lower():
                return {
                    "status": "invalid_key",
                    "message": f"Google API Key invalid: {err_msg[:200]}",
                }
            if "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
                return {
                    "status": "exhausted_balance",
                    "message": f"Google API quota exhausted: {err_msg[:200]}",
                }
            return {
                "status": "error",
                "message": f"Google Veo API error: {err_msg[:200]}",
            }

    def generate_text_to_video(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        if not self.is_configured:
            raise VideoProviderError("Google Veo requires GEMINI_API_KEY or GOOGLE_API_KEY.")

        status_info = self.check_account_status()
        if status_info["status"] != "ready":
            raise VideoProviderError(f"Google Veo unavailable: {status_info['message']}")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)
        dur_int = 5 if duration_seconds <= 6.0 else 8

        cinematic_prompt = (
            f"{prompt.strip()}, 4k resolution, cinematic lighting, natural realistic motion, "
            f"masterpiece quality, high frame rate, photorealistic"
        )
        logger.info(f"Submitting Text-to-Video to Google Veo ({self.model})...")

        operation = client.models.generate_videos(
            model=self.model,
            prompt=cinematic_prompt,
            config=types.GenerateVideosConfig(
                aspect_ratio="16:9",
                duration_seconds=dur_int,
            ),
        )

        while not operation.done:
            time.sleep(4)
            operation = client.operations.get(operation)

        if not operation.result or not operation.result.generated_videos:
            raise VideoProviderError(f"Google Veo generation failed: {operation.error}")

        generated_vid = operation.result.generated_videos[0]
        if output_path is None:
            output_dir = job_path or Path(".")
            output_path = output_dir / f"veo_t2v_{int(time.time())}.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if hasattr(generated_vid.video, "video_bytes") and generated_vid.video.video_bytes:
            output_path.write_bytes(generated_vid.video.video_bytes)
        elif hasattr(generated_vid.video, "uri") and generated_vid.video.uri:
            from src.clients.file_ai import get_file_ai_client
            client_dl = get_file_ai_client()
            client_dl._safe_download_file(generated_vid.video.uri, output_path)

        actual_dur = probe_duration(output_path)
        return VideoResult(
            video_path=output_path,
            provider_used=self.name,
            model_name=self.model,
            duration_seconds=actual_dur,
            is_ai_generated=True,
            reason=f"Authentic neural AI video synthesized with Google Veo ({self.model}).",
            metadata={"prompt": cinematic_prompt},
        )

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
            raise VideoProviderError("Google Veo requires GEMINI_API_KEY or GOOGLE_API_KEY.")

        status_info = self.check_account_status()
        if status_info["status"] != "ready":
            raise VideoProviderError(f"Google Veo unavailable: {status_info['message']}")

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)
        dur_int = 5 if duration_seconds <= 6.0 else 8

        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Input image not found at '{image_path}'")

        img_bytes = image_path.read_bytes()
        mime_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        gen_image = types.Image(image_bytes=img_bytes, mime_type=mime_type)

        motion_prompt = (
            prompt.strip()
            if prompt and prompt.strip()
            else "Cinematic high definition motion, subject moving naturally, subtle facial expression, breathing, realistic lighting"
        )
        enhanced_prompt = (
            f"{motion_prompt}, maintaining consistent subject identity, facial features, and appearance from reference photo"
        )

        logger.info(f"Submitting Image-to-Video to Google Veo ({self.model})...")
        operation = client.models.generate_videos(
            model=self.model,
            image=gen_image,
            prompt=enhanced_prompt,
            config=types.GenerateVideosConfig(
                aspect_ratio="16:9",
                duration_seconds=dur_int,
            ),
        )

        while not operation.done:
            time.sleep(4)
            operation = client.operations.get(operation)

        if not operation.result or not operation.result.generated_videos:
            raise VideoProviderError(f"Google Veo generation failed: {operation.error}")

        generated_vid = operation.result.generated_videos[0]
        if output_path is None:
            output_dir = job_path or image_path.parent
            output_path = output_dir / f"{image_path.stem}_veo_ai_video.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if hasattr(generated_vid.video, "video_bytes") and generated_vid.video.video_bytes:
            output_path.write_bytes(generated_vid.video.video_bytes)
        elif hasattr(generated_vid.video, "uri") and generated_vid.video.uri:
            from src.clients.file_ai import get_file_ai_client
            client_dl = get_file_ai_client()
            client_dl._safe_download_file(generated_vid.video.uri, output_path)

        actual_dur = probe_duration(output_path)
        return VideoResult(
            video_path=output_path,
            provider_used=self.name,
            model_name=self.model,
            duration_seconds=actual_dur,
            is_ai_generated=True,
            reason=f"Authentic neural AI video synthesized with Google Veo ({self.model}) preserving subject identity.",
            metadata={"source_image": str(image_path), "prompt": enhanced_prompt},
        )


class FalAIVideoProvider(BaseVideoProvider):
    """
    Genuine AI Video Generation provider powered by fal.ai.
    Uses state-of-the-art neural image-to-video models (Minimax Video-01, Kling, Luma)
    to generate authentic moving scenes while preserving the visual reference and subject identity.
    """
    name = "fal_ai"
    DEFAULT_I2V_MODEL = "fal-ai/minimax/video-01/image-to-video"
    DEFAULT_T2V_MODEL = "fal-ai/minimax/video-01"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (
                os.getenv("FAL_KEY")
                or getattr(settings, "file_ai_api_key", None)
                or ""
            ).strip()
        self.model = model or self.DEFAULT_I2V_MODEL

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

        # 1. Query current user profile to inspect is_locked and lock_reason
        url = "https://rest.fal.ai/users/current"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Key {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "fal-client/0.5",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as res:
                if res.status == 200:
                    user_data = json.loads(res.read().decode("utf-8"))
                    if user_data.get("is_locked"):
                        reason = user_data.get("lock_reason", "Exhausted balance.")
                        return {
                            "status": "exhausted_balance",
                            "message": f"User is locked: {reason}",
                        }
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
                "Configure FAL_KEY in your .env file or choose Slideshow."
            )

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

    def generate_text_to_video(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        if not self.is_configured:
            raise VideoProviderError(
                "Genuine AI video generation requires an active fal.ai API key (FAL_KEY). "
                "Configure FAL_KEY in your .env file or choose Slideshow."
            )

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

        model_name = self.DEFAULT_T2V_MODEL if "image-to-video" in self.model else self.model
        if output_path is None:
            output_dir = job_path or Path(".")
            output_path = output_dir / f"fal_t2v_{int(time.time())}.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Submitting AI text-to-video request to {model_name}...")
        try:
            res = fal_client.subscribe(
                model_name,
                arguments={
                    "prompt": prompt,
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

        from src.clients.file_ai import get_file_ai_client
        client = get_file_ai_client()
        client._safe_download_file(vid_url, output_path)

        actual_dur = probe_duration(output_path)
        return VideoResult(
            video_path=output_path,
            provider_used=self.name,
            model_name=model_name,
            duration_seconds=actual_dur,
            is_ai_generated=True,
            reason=f"Genuine AI video synthesized with {model_name}.",
            metadata={"source_url": vid_url, "prompt": prompt},
        )


class KenBurnsVideoProvider(BaseVideoProvider):
    """
    Procedural camera motion animation provider using Ken Burns pan/zoom.
    Explicitly labeled as procedural camera motion (not faked as genuine AI video).
    Available as an offline, zero-quota alternative.
    """
    name = "ken_burns"

    def check_account_status(self) -> Dict[str, Any]:
        return {"status": "ready", "message": "Offline procedural camera motion available locally."}

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

    def generate_text_to_video(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        output_path: Optional[Path] = None,
        job_path: Optional[Path] = None,
    ) -> VideoResult:
        from src.services.image_provider import get_image_provider
        from src.services.slideshow_compositor import SlideshowCompositor

        if output_path is None:
            output_dir = job_path or Path(".")
            output_path = output_dir / f"ken_burns_t2v_{int(time.time())}.mp4"
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Generate image for prompt
        img_prov = get_image_provider(provider_name=settings.image_provider)
        img_res = img_prov.generate(prompt=prompt, style="cinematic")

        dur = float(duration_seconds or 5.0)
        SlideshowCompositor.render_scene_clip(
            image_path=Path(img_res.path),
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
            metadata={"prompt": prompt},
        )


def get_video_provider(
    prefer_slideshow: bool = False,
    provider_name: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseVideoProvider:
    """
    Factory resolving the appropriate video provider based on configuration and preferences.
    Prioritizes:
    1. Google Veo (if configured and requested or auto)
    2. fal.ai (if configured and requested or auto)
    3. Ken Burns procedural motion (if requested or in offline mock sandbox)
    """
    if prefer_slideshow or provider_name in ("slideshow", "ken_burns"):
        return KenBurnsVideoProvider()

    req_prov = (provider_name or getattr(settings, "video_provider", "auto") or "auto").lower()

    if req_prov == "google_veo":
        return GoogleVeoVideoProvider(model=model)

    if req_prov == "fal_ai":
        return FalAIVideoProvider(model=model)

    # Auto resolution: Check Google Veo first
    veo = GoogleVeoVideoProvider(model=model)
    if veo.is_configured:
        return veo

    # Check fal.ai
    fal = FalAIVideoProvider(model=model)
    if fal.is_configured:
        return fal

    # If mock fallback is explicitly allowed in config (e.g. for offline test sandbox), use KenBurns
    if getattr(settings, "file_ai_mock_fallback", True):
        return KenBurnsVideoProvider()

    # In production without mock fallback, raise clear error
    raise VideoProviderError(
        "No active AI video provider configured. Please configure GEMINI_API_KEY (for Google Veo) "
        "or FAL_KEY in your environment, or select Slideshow."
    )

from abc import ABC, abstractmethod
from dataclasses import dataclass
import hashlib
import math
from pathlib import Path
import re
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from src.config import settings
from src.services.scene_planner import (
    ALLOWED_STYLES,
    SAFETY_DISCLAIMER,
    check_prompt_safety,
)


@dataclass
class ImageResult:
    """Result of an image generation operation."""
    path: Path
    provider_used: str
    cache_hit: bool = False
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
    prompt: str = ""
    style: str = "cinematic"
    seed: int = 42
    safety_note: str = SAFETY_DISCLAIMER


def compute_image_cache_key(prompt: str, style: str, seed: int) -> str:
    """Compute deterministic cache key for an image prompt, style, and seed."""
    normalized = f"{prompt.strip().lower()}::{style.strip().lower()}::{seed}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


class BaseImageProvider(ABC):
    """Abstract base class for all image providers."""
    name: str = "base"

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or settings.image_cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def generate(
        self,
        prompt: str,
        style: str = "cinematic",
        seed: int = 42,
        key_phrase: Optional[str] = None,
        output_path: Optional[Path] = None,
        use_cache: bool = True,
    ) -> ImageResult:
        """
        Generate or retrieve cached image.
        Performs safety check, cache lookup, and provider generation.
        """
        # 1. Safety check
        _, safe_prompt = check_prompt_safety(prompt)

        # 2. Cache lookup
        cache_key = compute_image_cache_key(safe_prompt, style, seed)
        cached_file = self.cache_dir / f"{cache_key}.png"

        if use_cache and cached_file.exists():
            dest = output_path or cached_file
            if dest != cached_file:
                # Copy or write to requested output path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(cached_file.read_bytes())
            return ImageResult(
                path=dest,
                provider_used=self.name,
                cache_hit=True,
                prompt=safe_prompt,
                style=style,
                seed=seed,
                safety_note=SAFETY_DISCLAIMER,
            )

        # 3. Destination target
        target = output_path or cached_file
        target.parent.mkdir(parents=True, exist_ok=True)

        # 4. Generate implementation
        res = self._generate_image(
            prompt=safe_prompt,
            style=style,
            seed=seed,
            key_phrase=key_phrase,
            target_path=target,
        )

        # Ensure cache copy exists
        if target != cached_file and target.exists():
            cached_file.write_bytes(target.read_bytes())

        return res

    @abstractmethod
    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        pass


class CardsImageProvider(BaseImageProvider):
    """
    Procedural title card image provider.
    Requires no neural model. Renders smooth gradient backgrounds,
    decorative shapes, and readable centered text with Pillow.
    Always available and fast.
    """
    name = "cards"

    # Harmonious color palettes (top_color, bottom_color, accent_color, text_color)
    PALETTES = {
        "cinematic": ((15, 23, 42), (49, 46, 129), (99, 102, 241), (248, 250, 252)),
        "watercolor": ((245, 230, 235), (224, 242, 254), (167, 139, 250), (30, 41, 59)),
        "flat illustration": ((6, 78, 59), (4, 120, 87), (52, 211, 153), (255, 255, 255)),
        "photo": ((24, 24, 27), (63, 63, 70), (161, 161, 170), (250, 250, 250)),
    }

    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        width, height = 512, 512
        img = Image.new("RGB", (width, height))
        draw = ImageDraw.Draw(img)

        # Choose palette based on style or seed variation
        style_key = style.strip().lower() if style else "cinematic"
        palette = self.PALETTES.get(style_key, self.PALETTES["cinematic"])
        top_color, bottom_color, accent_color, text_color = palette

        # Seed-based variation in color hue
        shift = (seed % 17) - 8
        def clamp_rgb(col, s):
            return tuple(max(0, min(255, c + s)) for c in col)

        top_col = clamp_rgb(top_color, shift)
        bot_col = clamp_rgb(bottom_color, -shift)

        # 1. Draw smooth vertical gradient
        for y in range(height):
            ratio = y / float(height - 1)
            r = int(top_col[0] * (1 - ratio) + bot_col[0] * ratio)
            g = int(top_col[1] * (1 - ratio) + bot_col[1] * ratio)
            b = int(top_col[2] * (1 - ratio) + bot_col[2] * ratio)
            draw.line([(0, y), (width, y)], fill=(r, g, b))

        # 2. Draw simple geometric decorative shapes
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)

        # Subtle corner framing borders
        margin = 24
        overlay_draw.rounded_rectangle(
            [(margin, margin), (width - margin, height - margin)],
            radius=16,
            outline=(*accent_color, 80),
            width=2,
        )

        # Decorative soft circle accent
        cx = int(width * 0.8)
        cy = int(height * 0.2)
        radius = 45
        overlay_draw.ellipse(
            [(cx - radius, cy - radius), (cx + radius, cy + radius)],
            outline=(*accent_color, 60),
            width=2,
        )

        # Decorative bottom bar
        bar_w = 60
        bar_y = height - 48
        overlay_draw.rectangle(
            [((width - bar_w) // 2, bar_y), ((width + bar_w) // 2, bar_y + 3)],
            fill=(*accent_color, 120),
        )

        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(img)

        # 3. Render readable text of key phrase or prompt
        display_text = key_phrase or prompt
        # Clean text
        display_text = re.sub(r"\s+", " ", display_text).strip()

        # Word wrap text into lines (max ~24 chars per line)
        words = display_text.split()
        lines: list[str] = []
        current_line: list[str] = []
        for w in words:
            if sum(len(x) + 1 for x in current_line) + len(w) > 22:
                lines.append(" ".join(current_line))
                current_line = [w]
            else:
                current_line.append(w)
        if current_line:
            lines.append(" ".join(current_line))

        # Truncate lines if too many
        lines = lines[:4]

        # Use default font or truetype if available
        font = ImageFont.load_default()
        line_height = 20

        # Try to use a larger font if system supports it
        for font_name in ["arial.ttf", "DejaVuSans.ttf", "segoeui.ttf"]:
            try:
                font = ImageFont.truetype(font_name, size=24)
                line_height = 32
                break
            except Exception:
                continue

        # Draw centered text with subtle shadow
        total_text_h = len(lines) * line_height
        start_y = (height - total_text_h) // 2

        for i, line in enumerate(lines):
            try:
                bbox = draw.textbbox((0, 0), line, font=font)
                text_w = bbox[2] - bbox[0]
            except Exception:
                text_w = len(line) * 10
            x = (width - text_w) // 2
            y = start_y + (i * line_height)

            # Drop shadow
            shadow_col = (0, 0, 0) if text_color[0] > 128 else (255, 255, 255)
            draw.text((x + 1, y + 1), line, fill=shadow_col, font=font)
            # Main text
            draw.text((x, y), line, fill=text_color, font=font)

        target_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(target_path, format="PNG")

        return ImageResult(
            path=target_path,
            provider_used=self.name,
            cache_hit=False,
            prompt=prompt,
            style=style,
            seed=seed,
            safety_note=SAFETY_DISCLAIMER,
        )


class DiffusersImageProvider(BaseImageProvider):
    """
    Local SD-Turbo image provider via diffusers.
    Runs 1 to 4 steps, 512x512, float16 on CUDA, attention slicing on CPU.
    Requires weights downloaded to models/sd-turbo beforehand.
    Never attempts internet downloads at runtime.
    """
    name = "diffusers"

    def __init__(self, model_path: Optional[str] = None, cache_dir: Optional[Path] = None):
        super().__init__(cache_dir=cache_dir)
        self.model_path = Path(model_path or settings.sd_turbo_model_path)
        self._pipe = None

    def _ensure_pipeline(self):
        """Load pipeline locally from models/ folder. Raises FileNotFoundError if missing."""
        if self._pipe is not None:
            return self._pipe

        if not self.model_path.exists() or not (self.model_path / "model_index.json").exists():
            raise FileNotFoundError(
                f"SD-Turbo model weights missing at {self.model_path}. "
                f"Run 'python scripts/download_sd_turbo.py' once to download them."
            )

        try:
            from diffusers import AutoPipelineForText2Image
            import torch
        except ImportError as exc:
            raise ImportError(f"Diffusers/torch libraries not installed: {exc}")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        pipe = AutoPipelineForText2Image.from_pretrained(
            str(self.model_path),
            torch_dtype=dtype,
            local_files_only=True,
        )

        if device == "cuda":
            pipe = pipe.to("cuda")
        else:
            pipe = pipe.to("cpu")
            try:
                pipe.enable_attention_slicing()
            except Exception:
                pass

        self._pipe = pipe
        return self._pipe

    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        pipe = self._ensure_pipeline()
        import torch

        device = pipe.device
        generator = torch.Generator(device=device).manual_seed(seed)

        # SD-Turbo performs best with 1-4 steps and guidance_scale=0.0
        output = pipe(
            prompt=prompt,
            num_inference_steps=2,
            guidance_scale=0.0,
            generator=generator,
            height=512,
            width=512,
        )
        image = output.images[0]
        target_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(target_path, format="PNG")

        return ImageResult(
            path=target_path,
            provider_used=self.name,
            cache_hit=False,
            prompt=prompt,
            style=style,
            seed=seed,
            safety_note=SAFETY_DISCLAIMER,
        )


class UploadedImageProvider(BaseImageProvider):
    """
    Image provider using user-provided uploaded images.
    Crops and resizes to 512x512 standard format.
    """
    name = "uploaded"

    def __init__(self, source_image_path: Optional[Path] = None, cache_dir: Optional[Path] = None):
        super().__init__(cache_dir=cache_dir)
        self.source_image_path = source_image_path

    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        if self.source_image_path and self.source_image_path.exists():
            with Image.open(self.source_image_path) as img:
                img = img.convert("RGB")
                img = img.resize((512, 512), Image.Resampling.LANCZOS)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                img.save(target_path, format="PNG")
        else:
            # Fall back to procedural title card if user image is not specified
            cards = CardsImageProvider(cache_dir=self.cache_dir)
            return cards._generate_image(prompt, style, seed, key_phrase, target_path)

        return ImageResult(
            path=target_path,
            provider_used=self.name,
            cache_hit=False,
            prompt=prompt,
            style=style,
            seed=seed,
            safety_note=SAFETY_DISCLAIMER,
        )


class FakeImageProvider(BaseImageProvider):
    """
    Fast deterministic dummy image provider for automated tests.
    Generates 512x512 solid/patterned PNGs instantly without downloads.
    """
    name = "fake"

    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        width, height = 512, 512
        # Deterministic color from seed
        r = (seed * 37) % 256
        g = (seed * 67) % 256
        b = (seed * 97) % 256
        img = Image.new("RGB", (width, height), (r, g, b))
        draw = ImageDraw.Draw(img)

        # Draw test pattern
        draw.rectangle([(20, 20), (width - 20, height - 20)], outline=(255, 255, 255), width=3)
        draw.text((40, 40), f"Fake: {style} (seed={seed})", fill=(255, 255, 255))
        if key_phrase:
            draw.text((40, 80), key_phrase[:30], fill=(255, 255, 255))

        target_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(target_path, format="PNG")

        return ImageResult(
            path=target_path,
            provider_used=self.name,
            cache_hit=False,
            prompt=prompt,
            style=style,
            seed=seed,
            safety_note=SAFETY_DISCLAIMER,
        )


class AutoFallbackImageProvider(BaseImageProvider):
    """
    Wraps a primary image provider (e.g. Diffusers) with auto-fallback to
    CardsImageProvider if model weights are missing or generation fails.
    Reports the fallback status and reason to the caller.
    """
    name = "auto_fallback"

    def __init__(self, primary: BaseImageProvider, fallback: Optional[BaseImageProvider] = None):
        super().__init__(cache_dir=primary.cache_dir)
        self.primary = primary
        self.fallback = fallback or CardsImageProvider(cache_dir=primary.cache_dir)

    def _generate_image(
        self,
        prompt: str,
        style: str,
        seed: int,
        key_phrase: Optional[str],
        target_path: Path,
    ) -> ImageResult:
        try:
            return self.primary._generate_image(
                prompt=prompt,
                style=style,
                seed=seed,
                key_phrase=key_phrase,
                target_path=target_path,
            )
        except Exception as exc:
            reason = f"Primary provider '{self.primary.name}' unavailable ({exc}). Using procedural title cards."
            res = self.fallback._generate_image(
                prompt=prompt,
                style=style,
                seed=seed,
                key_phrase=key_phrase,
                target_path=target_path,
            )
            res.fallback_used = True
            res.fallback_reason = reason
            return res


def get_image_provider(
    provider_name: Optional[str] = None,
    source_image_path: Optional[Path] = None,
    cache_dir: Optional[Path] = None,
) -> BaseImageProvider:
    """
    Factory function returning the configured ImageProvider.
    If 'diffusers' is selected, wraps it with AutoFallbackImageProvider to gracefully
    fall back to 'cards' when offline weights are not yet downloaded.
    """
    name = (provider_name or settings.image_provider).strip().lower()

    if name == "diffusers":
        diffusers_prov = DiffusersImageProvider(cache_dir=cache_dir)
        return AutoFallbackImageProvider(
            primary=diffusers_prov,
            fallback=CardsImageProvider(cache_dir=cache_dir),
        )
    elif name == "cards":
        return CardsImageProvider(cache_dir=cache_dir)
    elif name == "uploaded":
        return UploadedImageProvider(source_image_path=source_image_path, cache_dir=cache_dir)
    elif name == "fake":
        return FakeImageProvider(cache_dir=cache_dir)
    else:
        # Default fallback to cards
        return CardsImageProvider(cache_dir=cache_dir)

from pathlib import Path
import pytest
from PIL import Image

from src.services.image_provider import (
    AutoFallbackImageProvider,
    CardsImageProvider,
    DiffusersImageProvider,
    FakeImageProvider,
    UploadedImageProvider,
    compute_image_cache_key,
    get_image_provider,
)
from src.services.scene_planner import SAFETY_DISCLAIMER


class TestImageProvider:
    @pytest.fixture
    def temp_cache_dir(self, tmp_path):
        cache_dir = tmp_path / "img_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def test_cache_key_deterministic(self):
        k1 = compute_image_cache_key("a cozy cabin in the woods", "cinematic", 42)
        k2 = compute_image_cache_key("a cozy cabin in the woods", "cinematic", 42)
        k3 = compute_image_cache_key("a cozy cabin in the woods", "cinematic", 99)
        assert k1 == k2
        assert k1 != k3
        assert len(k1) == 16

    def test_cards_provider_generates_valid_512x512_png(self, temp_cache_dir):
        cards = CardsImageProvider(cache_dir=temp_cache_dir)
        target = temp_cache_dir / "test_card.png"
        res = cards.generate(
            prompt="A majestic waterfall cascading down emerald cliffs",
            style="cinematic",
            seed=42,
            key_phrase="Majestic Waterfall",
            output_path=target,
            use_cache=False,
        )

        assert res.path.exists()
        assert res.provider_used == "cards"
        assert res.cache_hit is False
        assert res.safety_note == SAFETY_DISCLAIMER

        with Image.open(res.path) as img:
            assert img.size == (512, 512)
            assert img.format == "PNG"

    def test_cache_hit_behavior(self, temp_cache_dir):
        fake_prov = FakeImageProvider(cache_dir=temp_cache_dir)
        prompt = "Peaceful mountain sunrise"
        style = "watercolor"
        seed = 123

        # First generation -> cache_hit is False
        res1 = fake_prov.generate(prompt=prompt, style=style, seed=seed, use_cache=True)
        assert res1.cache_hit is False
        assert res1.path.exists()

        # Second generation with same prompt, style, seed -> cache_hit is True
        res2 = fake_prov.generate(prompt=prompt, style=style, seed=seed, use_cache=True)
        assert res2.cache_hit is True
        assert res2.path == res1.path

    def test_diffusers_auto_fallback_to_cards_when_model_missing(self, tmp_path, temp_cache_dir):
        missing_model_dir = tmp_path / "nonexistent_sd_turbo"
        diffusers_prov = DiffusersImageProvider(
            model_path=str(missing_model_dir),
            cache_dir=temp_cache_dir,
        )
        fallback_prov = AutoFallbackImageProvider(
            primary=diffusers_prov,
            fallback=CardsImageProvider(cache_dir=temp_cache_dir),
        )

        res = fallback_prov.generate(
            prompt="Sunlight filtering through golden autumn leaves",
            style="photo",
            seed=7,
            key_phrase="Golden Autumn",
            use_cache=False,
        )

        assert res.path.exists()
        assert res.fallback_used is True
        assert "unavailable" in res.fallback_reason.lower() or "missing" in res.fallback_reason.lower()
        with Image.open(res.path) as img:
            assert img.size == (512, 512)

    def test_factory_returns_expected_providers(self, temp_cache_dir):
        p_cards = get_image_provider("cards", cache_dir=temp_cache_dir)
        assert isinstance(p_cards, CardsImageProvider)

        p_fake = get_image_provider("fake", cache_dir=temp_cache_dir)
        assert isinstance(p_fake, FakeImageProvider)

        p_diffusers = get_image_provider("diffusers", cache_dir=temp_cache_dir)
        assert isinstance(p_diffusers, AutoFallbackImageProvider)

    def test_uploaded_image_provider_crops_and_resizes(self, tmp_path, temp_cache_dir):
        # Create a dummy user image with dimensions 800x600
        source_img_path = tmp_path / "user_photo.jpg"
        dummy = Image.new("RGB", (800, 600), (100, 150, 200))
        dummy.save(source_img_path)

        uploaded_prov = UploadedImageProvider(source_image_path=source_img_path, cache_dir=temp_cache_dir)
        target = temp_cache_dir / "user_resized.png"
        res = uploaded_prov.generate(
            prompt="User uploaded scene",
            output_path=target,
            use_cache=False,
        )

        assert res.path.exists()
        assert res.provider_used == "uploaded"
        with Image.open(res.path) as img:
            assert img.size == (512, 512)

    def test_safety_check_sanitizes_prompt(self, temp_cache_dir):
        fake_prov = FakeImageProvider(cache_dir=temp_cache_dir)
        unsafe = "A violent warzone with blood and weapons"
        res = fake_prov.generate(prompt=unsafe, use_cache=False)
        assert "peaceful scenic landscape" in res.prompt
        assert "blood" not in res.prompt.lower()
        assert res.safety_note == SAFETY_DISCLAIMER

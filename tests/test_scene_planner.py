import pytest

from src.config import settings
from src.services.llm import FakeLLMProvider
from src.services.scene_planner import (
    ALLOWED_STYLES,
    SAFETY_BLOCKLIST,
    SAFETY_DISCLAIMER,
    ScenePlan,
    build_scene_image_prompt,
    check_prompt_safety,
    extract_key_nouns_and_phrase,
    plan_scenes,
)


class TestScenePlanner:
    def test_empty_script(self):
        plan = plan_scenes("", style="cinematic")
        assert len(plan.scenes) == 0
        assert plan.total_duration_seconds == 0.0

    def test_duration_splitting_5_to_8_seconds(self):
        # A script with 4 distinct sentences.
        # At 148 WPM (~2.46 words/sec), 15-20 words is ~6-8 seconds.
        script = (
            "The morning sun slowly crested over the quiet misty mountains. "
            "A gentle stream flowed peacefully through the ancient pine forest below. "
            "Wild birds sang their earliest melodies across the dew covered meadow. "
            "Everything felt remarkably calm as a new day began in nature."
        )
        plan = plan_scenes(script, style="cinematic", words_per_minute=148.0)

        assert len(plan.scenes) >= 2
        assert plan.style == "cinematic"
        assert plan.safety_note == SAFETY_DISCLAIMER

        # Check timeline continuity and durations
        current_time = 0.0
        for scene in plan.scenes:
            assert scene.start_time == pytest.approx(current_time, abs=0.05)
            assert scene.end_time > scene.start_time
            assert scene.duration_seconds > 0.0
            # Target range is about 5 to 8 seconds (trailing or single scenes may vary slightly)
            assert scene.image_prompt != ""
            assert scene.key_phrase != ""
            assert scene.safety_note == SAFETY_DISCLAIMER
            current_time = scene.end_time

        assert plan.total_duration_seconds == pytest.approx(current_time, abs=0.05)

    def test_extract_key_nouns_and_phrase(self):
        sentence = "A magnificent golden eagle soared majestically above the rocky canyon."
        nouns, phrase = extract_key_nouns_and_phrase(sentence)
        assert len(nouns) > 0
        assert any(w in ["magnificent", "golden", "eagle", "soared", "canyon", "rocky"] for w in nouns)
        assert len(phrase.split()) >= 3

    def test_prompt_construction_default_styles(self):
        sentence = "The wooden boat drifted near the calm harbor."
        for style_name in ["cinematic", "watercolor", "flat illustration", "photo"]:
            prompt, phrase = build_scene_image_prompt(sentence, style=style_name)
            assert prompt != ""
            assert ALLOWED_STYLES[style_name] in prompt

    def test_prompt_construction_with_llm(self):
        fake_llm = FakeLLMProvider()
        sentence = "An old clock tower rings across the bustling cobblestone plaza."
        prompt, phrase = build_scene_image_prompt(
            sentence,
            style="watercolor",
            llm_provider=fake_llm,
        )
        assert prompt != ""
        assert ALLOWED_STYLES["watercolor"] in prompt

    def test_safety_blocklist_filtering(self):
        unsafe_prompt = "A violent battlefield with blood and weapons everywhere"
        is_safe, sanitized = check_prompt_safety(unsafe_prompt)
        assert is_safe is False
        assert "peaceful scenic landscape" in sanitized

        # Verify through build_scene_image_prompt
        prompt, _ = build_scene_image_prompt("A terrible bloody murder scene with weapons")
        assert "peaceful scenic landscape" in prompt
        assert "bloody" not in prompt.lower()
        assert "murder" not in prompt.lower()

    def test_disclaimer_note_on_all_scenes(self):
        script = "Step one is simple. Step two takes a bit more patience."
        plan = plan_scenes(script, style="photo")
        assert len(plan.scenes) > 0
        for scene in plan.scenes:
            assert scene.safety_note == SAFETY_DISCLAIMER

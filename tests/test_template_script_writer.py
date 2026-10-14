import re
import pytest

from src.config import settings
from src.services.script_writer import generate_script
from src.services.template_script_writer import (
    build_template_script,
    extract_body_points,
)


class TestTemplateScriptWriter:
    def test_extract_3_to_6_body_points_from_idea(self):
        idea = "A morning walk in the pine forest, finding a quiet creek, listening to the birds, and feeling totally at ease."
        points = extract_body_points(idea)
        assert 3 <= len(points) <= 6
        # Confirm points contain parts of the idea
        text = " ".join(points).lower()
        assert "morning walk" in text or "creek" in text or "birds" in text

    def test_single_phrase_idea_derives_at_least_3_points(self):
        idea = "Graduation day celebration"
        points = extract_body_points(idea)
        assert len(points) == 3
        assert any("graduation day celebration" in p.lower() for p in points)

    def test_template_target_bounds_30s(self):
        # 30s @ 148 WPM = 74 words. 90%-110% bounds = [67, 81] words.
        target_words = round(30.0 / 60.0 * settings.words_per_minute)
        assert target_words == 74
        min_words = round(target_words * 0.90)
        max_words = round(target_words * 1.10)

        idea = "Walking by the ocean shore, watching the rolling waves, and feeling the cool breeze."
        script = build_template_script(idea=idea, duration_seconds=30.0, tone="friendly")
        words = script.split()

        assert min_words <= len(words) <= max_words, f"Expected {min_words}-{max_words} words, got {len(words)}"

    def test_template_target_bounds_1m(self):
        # 60s @ 148 WPM = 148 words. 90%-110% bounds = [133, 163] words.
        target_words = round(60.0 / 60.0 * settings.words_per_minute)
        assert target_words == 148
        min_words = round(target_words * 0.90)
        max_words = round(target_words * 1.10)

        idea = "Our weekend road trip into the mountains, camping by the lake, making a campfire, and telling stories."
        script = build_template_script(idea=idea, duration_seconds=60.0, tone="storytelling")
        words = script.split()

        assert min_words <= len(words) <= max_words, f"Expected {min_words}-{max_words} words, got {len(words)}"

    def test_template_target_bounds_10m(self):
        # 600s @ 148 WPM = 1480 words. 90%-110% bounds = [1332, 1628] words.
        target_words = round(600.0 / 60.0 * settings.words_per_minute)
        assert target_words == 1480
        min_words = round(target_words * 0.90)
        max_words = round(target_words * 1.10)

        idea = "A deep retrospective on our five-year startup journey, overcoming early obstacles, building great friendships, and finding our purpose."
        script = build_template_script(idea=idea, duration_seconds=600.0, tone="professional")
        words = script.split()

        assert min_words <= len(words) <= max_words, f"Expected {min_words}-{max_words} words, got {len(words)}"

    def test_deterministic_output(self):
        idea = "Exploring the quiet corners of Kyoto, finding secret gardens, and drinking matcha."
        run1 = build_template_script(idea=idea, duration_seconds=30.0, tone="educational")
        run2 = build_template_script(idea=idea, duration_seconds=30.0, tone="educational")
        run3 = build_template_script(idea=idea, duration_seconds=30.0, tone="educational")

        assert run1 == run2 == run3, "Template script generator must produce deterministic output"

    def test_no_markdown_emojis_or_stage_directions(self):
        idea = "A lovely sunset picnic, sharing fresh fruit, and watching the stars come out."
        tones = ["friendly", "professional", "storytelling", "educational"]

        for t in tones:
            script = build_template_script(idea=idea, duration_seconds=30.0, tone=t)
            assert "#" not in script
            assert "*" not in script
            assert "_" not in script
            assert "`" not in script
            assert "[" not in script
            assert "]" not in script
            assert "(" not in script
            assert ")" not in script
            # Ensure no emojis
            assert not re.search(r"[\U00010000-\U0010ffff]", script)
            # Ensure no speaker labels like "Narrator:"
            assert not re.search(r"^[A-Za-z]+:\s*", script, re.MULTILINE)

    def test_generate_script_integration_with_template(self, monkeypatch):
        monkeypatch.setattr(settings, "llm_provider", "template")

        res = generate_script(
            prompt="Reflections on planting a flower garden with my grandparents",
            duration_seconds=30.0,
            tone="storytelling",
        )
        assert res.script_source == "template"
        assert 66 <= res.word_count <= 82
        assert res.target_words == 74
        assert "flower garden" in res.script

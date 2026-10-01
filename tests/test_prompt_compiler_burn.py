from src.config import settings
from src.services.prompt_compiler import compile_plan


def test_compile_plan_burn_subtitles(monkeypatch):
    monkeypatch.setattr(settings, "allow_burn_subtitles", True)
    plan = compile_plan(
        job_id="job_test_burn",
        script="This is a test script.",
        prompt="Generate a video with burn subtitles",
    )
    assert plan.job_id == "job_test_burn"
    assert plan.subtitles.enabled is True
    assert hasattr(settings, "allow_burn_subtitles")
    assert plan.subtitles.burn_in is True

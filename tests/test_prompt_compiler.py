from src.models.schemas import AspectRatio
from src.services.prompt_compiler import compile_plan


def test_compile_three_minute_prompt():
    plan = compile_plan(
        job_id="job_test",
        script="Hello. Welcome to our project.",
        prompt="Create a 3-minute professional video with subtitles.",
    )

    assert plan.target_duration_seconds == 180.0
    assert plan.duration_source == "prompt"
    assert plan.voice.tone == "professional"
    assert plan.subtitles.enabled is True


def test_compile_vertical_aspect_ratio():
    plan = compile_plan(
        job_id="job_test_2",
        script="Hello.",
        prompt="Create a 10-second vertical 9:16 video.",
    )

    assert plan.target_duration_seconds == 10.0
    assert plan.video.aspect_ratio == AspectRatio.NINE_SIXTEEN
    assert plan.video.resolution == "720x1280"
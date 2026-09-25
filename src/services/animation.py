from pathlib import Path

from src.models.schemas import CompiledPlan, SegmentSpec
from src.utils.ffmpeg import create_placeholder_video


class MockAnimationProvider:
    name = "mock_animation"
    version = "0.1.0"

    def generate_segment(
        self,
        segment: SegmentSpec,
        plan: CompiledPlan,
        job_path: Path,
        identity_pack: dict | None = None,
        voice_pack: dict | None = None,
    ) -> Path:
        """
        Mock animation provider.

        In production, replace with:
        - LivePortrait
        - EchoMimic
        - Hallo
        - SadTalker
        - or a commercial talking-head API.
        """

        videos_dir = job_path / "videos"
        videos_dir.mkdir(parents=True, exist_ok=True)

        path = videos_dir / f"{segment.segment_id}.mp4"

        colors = [
            "0x102030",
            "0x201030",
            "0x103020",
            "0x302010",
            "0x203010",
        ]

        color = colors[segment.index % len(colors)]

        create_placeholder_video(
            path=path,
            duration=segment.duration_s,
            resolution=plan.video.resolution,
            fps=plan.video.fps,
            color=color,
        )

        return path
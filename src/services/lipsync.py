from pathlib import Path

from src.models.schemas import CompiledPlan, SegmentSpec


class MockLipSyncProvider:
    name = "mock_lipsync"
    version = "0.1.0"

    def refine_segment(
        self,
        segment: SegmentSpec,
        plan: CompiledPlan,
        job_path: Path,
        identity_pack: dict | None = None,
        voice_pack: dict | None = None,
    ) -> Path:
        """
        Mock lip-sync refinement.

        In production, replace with:
        - MuseTalk
        - LatentSync
        - Wav2Lip
        - or another lip-sync refinement model.
        """

        if not segment.video_path:
            raise ValueError("Segment has no video path to refine.")

        return Path(segment.video_path)
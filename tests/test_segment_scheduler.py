from src.models.schemas import Timeline, TimelineEvent
from src.services.segment_scheduler import split_timeline


def test_split_30_second_timeline_into_10_second_segments():
    timeline = Timeline(
        events=[
            TimelineEvent(
                event_id="speech_1",
                type="speech",
                start_s=0.0,
                end_s=30.0,
                text=" ".join(["word"] * 60),
            )
        ],
        total_duration_seconds=30.0,
    )

    segments = split_timeline(timeline, max_segment_seconds=10.0)

    assert len(segments) >= 3
    assert all(s.duration_s <= 10.1 for s in segments)
    assert abs(sum(s.duration_s for s in segments) - 30.0) < 0.2
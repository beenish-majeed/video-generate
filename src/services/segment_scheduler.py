import math

from src.models.schemas import SegmentSpec, Timeline, TimelineEvent


def _make_segment(index: int, events: list[TimelineEvent]) -> SegmentSpec:
    start = events[0].start_s
    end = events[-1].end_s
    duration = max(0.01, end - start)

    text = " ".join(
        e.text for e in events if e.type == "speech" and e.text
    ).strip()

    return SegmentSpec(
        segment_id=f"seg_{index:04d}",
        index=index,
        start_s=start,
        end_s=end,
        duration_s=duration,
        text=text,
        events=events,
    )


def split_long_speech_events(
    events: list[TimelineEvent],
    max_seconds: float,
) -> list[TimelineEvent]:
    out: list[TimelineEvent] = []

    for event in events:
        duration = event.end_s - event.start_s

        if duration <= max_seconds:
            out.append(event)
            continue

        if event.type == "speech" and event.text:
            words = event.text.split()

            if not words:
                out.append(event)
                continue

            per_word = duration / len(words)
            max_words_per_chunk = max(1, int(math.floor(max_seconds / per_word)))

            chunks = [
                words[i : i + max_words_per_chunk]
                for i in range(0, len(words), max_words_per_chunk)
            ]

            total_words = sum(len(c) for c in chunks)
            cursor = event.start_s

            for i, chunk in enumerate(chunks):
                chunk_duration = duration * len(chunk) / total_words
                end = event.end_s if i == len(chunks) - 1 else cursor + chunk_duration

                out.append(
                    event.model_copy(
                        update={
                            "event_id": f"{event.event_id}_part{i + 1:02d}",
                            "text": " ".join(chunk),
                            "start_s": cursor,
                            "end_s": end,
                        }
                    )
                )

                cursor = end

        else:
            parts = max(2, math.ceil(duration / max_seconds))
            chunk_duration = duration / parts
            cursor = event.start_s

            for i in range(parts):
                end = event.end_s if i == parts - 1 else cursor + chunk_duration

                out.append(
                    event.model_copy(
                        update={
                            "event_id": f"{event.event_id}_part{i + 1:02d}",
                            "start_s": cursor,
                            "end_s": end,
                            "pause_ms": int(chunk_duration * 1000)
                            if event.pause_ms is not None
                            else None,
                        }
                    )
                )

                cursor = end

    return out


def split_timeline(
    timeline: Timeline,
    max_segment_seconds: float,
    min_segment_seconds: float = 0.5,
) -> list[SegmentSpec]:
    events = [e.model_copy() for e in timeline.events]

    if not events:
        events = [
            TimelineEvent(
                event_id="hold_0000",
                type="hold",
                start_s=0.0,
                end_s=timeline.total_duration_seconds,
            )
        ]

    if events[-1].end_s < timeline.total_duration_seconds - 0.01:
        events.append(
            TimelineEvent(
                event_id="hold_tail",
                type="hold",
                start_s=events[-1].end_s,
                end_s=timeline.total_duration_seconds,
            )
        )

    events = split_long_speech_events(events, max_segment_seconds)

    segments: list[SegmentSpec] = []
    current: list[TimelineEvent] = []
    current_duration = 0.0

    for event in events:
        duration = event.end_s - event.start_s

        if current and current_duration + duration > max_segment_seconds:
            segments.append(_make_segment(len(segments) + 1, current))
            current = []
            current_duration = 0.0

        current.append(event)
        current_duration += duration

    if current:
        segments.append(_make_segment(len(segments) + 1, current))

    merged: list[SegmentSpec] = []

    for segment in segments:
        if (
            merged
            and segment.duration_s < min_segment_seconds
            and merged[-1].duration_s + segment.duration_s <= max_segment_seconds
        ):
            prev = merged[-1]
            new_events = prev.events + segment.events
            new_end = segment.end_s
            new_duration = max(0.01, new_end - prev.start_s)

            merged[-1] = SegmentSpec(
                segment_id=prev.segment_id,
                index=prev.index,
                start_s=prev.start_s,
                end_s=new_end,
                duration_s=new_duration,
                text=(prev.text + " " + segment.text).strip(),
                events=new_events,
            )
        else:
            merged.append(segment)

    return merged
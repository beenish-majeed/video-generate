from src.models.schemas import CompiledPlan, Timeline, TimelineEvent
from src.utils.text import split_sentences


def estimate_speech_seconds(text: str, speed: float = 1.0, wpm: float = 150.0) -> float:
    words = len(text.split())
    if words == 0:
        return 0.5

    speed = max(0.1, float(speed))
    seconds = words / (wpm * speed) * 60.0
    return max(0.2, seconds)


def _rebuild_events_with_scaled_durations(
    events: list[TimelineEvent],
    scale_types: set[str],
    factor: float,
) -> list[TimelineEvent]:
    new_events: list[TimelineEvent] = []
    cursor = 0.0

    for event in events:
        duration = event.end_s - event.start_s

        if event.type in scale_types:
            duration *= factor

        end = cursor + duration

        update = {
            "start_s": cursor,
            "end_s": end,
        }

        if event.pause_ms is not None:
            update["pause_ms"] = int(round(duration * 1000))

        new_events.append(event.model_copy(update=update))
        cursor = end

    return new_events


def build_timeline(script: str, plan: CompiledPlan) -> Timeline:
    target = float(plan.target_duration_seconds)

    sentences = split_sentences(script)
    if not sentences:
        sentences = ["Hello."]

    events: list[TimelineEvent] = []
    cursor = 0.0

    for i, sentence in enumerate(sentences):
        speech_duration = estimate_speech_seconds(
            sentence,
            speed=plan.voice.speed,
        )

        events.append(
            TimelineEvent(
                event_id=f"speech_{i + 1:04d}",
                type="speech",
                start_s=cursor,
                end_s=cursor + speech_duration,
                text=sentence,
            )
        )

        cursor += speech_duration

        if i < len(sentences) - 1:
            pause_ms = plan.voice.pauses.between_sentences_ms

            if (
                plan.voice.pauses.after_major_points_ms
                and (i + 1) % 3 == 0
            ):
                pause_ms += plan.voice.pauses.after_major_points_ms

            if pause_ms > 0:
                pause_duration = pause_ms / 1000.0

                events.append(
                    TimelineEvent(
                        event_id=f"pause_{i + 1:04d}",
                        type="pause",
                        start_s=cursor,
                        end_s=cursor + pause_duration,
                        pause_ms=pause_ms,
                    )
                )

                cursor += pause_duration

    total = cursor

    if total < target:
        extra = target - total

        events.append(
            TimelineEvent(
                event_id="hold_end",
                type="hold",
                start_s=total,
                end_s=target,
                pause_ms=int(round(extra * 1000)),
            )
        )

        total = target

    elif total > target:
        pause_total = sum(
            event.end_s - event.start_s
            for event in events
            if event.type in {"pause", "hold"}
        )

        excess = total - target

        if pause_total > 0 and pause_total >= excess:
            factor = (pause_total - excess) / pause_total
            events = _rebuild_events_with_scaled_durations(
                events,
                scale_types={"pause", "hold"},
                factor=factor,
            )
            total = events[-1].end_s if events else 0.0

        if total > target + 0.001:
            speech_total = sum(
                event.end_s - event.start_s
                for event in events
                if event.type == "speech"
            )

            non_speech_total = total - speech_total
            allowed_speech = max(0.05, target - non_speech_total)

            factor = allowed_speech / speech_total if speech_total > 0 else 1.0

            events = _rebuild_events_with_scaled_durations(
                events,
                scale_types={"speech"},
                factor=factor,
            )

            total = events[-1].end_s if events else 0.0

            plan.warnings.append(
                "Script timing was compressed to meet the requested duration."
            )

        if total < target:
            extra = target - total

            events.append(
                TimelineEvent(
                    event_id="hold_end",
                    type="hold",
                    start_s=total,
                    end_s=target,
                    pause_ms=int(round(extra * 1000)),
                )
            )

            total = target

        elif total > target:
            last = events[-1]
            events[-1] = last.model_copy(update={"end_s": target})
            total = target

    if not events:
        events = [
            TimelineEvent(
                event_id="hold_0000",
                type="hold",
                start_s=0.0,
                end_s=target,
            )
        ]

    return Timeline(events=events, total_duration_seconds=target)
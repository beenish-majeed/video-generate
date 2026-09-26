from pathlib import Path

from src.models.schemas import Timeline, TTSSegment


def _format_vtt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))

    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))

    if ms == 1000:
        s += 1
        ms = 0

    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def generate_webvtt(
    timeline: Timeline,
    tts_segments_by_event_id: dict[str, TTSSegment],
    output_path: str | Path,
) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lines = ["WEBVTT", ""]
    cue_index = 1

    for event in timeline.events:
        if event.type != "speech" or not event.text:
            continue

        duration = max(0.01, event.end_s - event.start_s)
        segment = tts_segments_by_event_id.get(event.event_id)

        timestamps = segment.word_timestamps if segment else []

        if not timestamps:
            words = event.text.split()
            per_word = duration / max(1, len(words))

            timestamps = [
                {
                    "word": word,
                    "start": i * per_word,
                    "end": (i + 1) * per_word,
                }
                for i, word in enumerate(words)
            ]

        group: list[str] = []
        group_start: float | None = None
        group_end: float | None = None

        def flush_group() -> None:
            nonlocal cue_index, group, group_start, group_end

            if not group or group_start is None or group_end is None:
                group = []
                group_start = None
                group_end = None
                return

            text = " ".join(group).strip()

            if text:
                lines.append(str(cue_index))
                lines.append(
                    f"{_format_vtt_time(group_start)} --> {_format_vtt_time(group_end)}"
                )
                lines.append(text)
                lines.append("")
                cue_index += 1

            group = []
            group_start = None
            group_end = None

        for ts in timestamps:
            word = str(ts.get("word", "")).strip()
            if not word:
                continue

            start = event.start_s + float(ts.get("start", 0.0))
            end = event.start_s + float(ts.get("end", start + 0.2))

            if group_start is None:
                group_start = start

            candidate = group + [word]
            candidate_text = " ".join(candidate)

            if group and (len(candidate_text) > 42 or len(candidate) > 6):
                flush_group()
                group_start = start

            group.append(word)
            group_end = end

        flush_group()

    output_path.write_text("\n".join(lines), encoding="utf-8")
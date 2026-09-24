import re

WORD_NUMBERS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
}

COMMON_ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:3", "4:5"}


def _unit_seconds(unit: str) -> float | None:
    unit = unit.lower().strip()

    if unit in {"s", "sec", "secs", "second", "seconds"}:
        return 1.0

    if unit in {"m", "min", "mins", "minute", "minutes"}:
        return 60.0

    if unit in {"h", "hr", "hrs", "hour", "hours"}:
        return 3600.0

    return None


def parse_duration_seconds(text: str) -> float | None:
    if not text:
        return None

    t = text.lower().replace("-", " ").replace("_", " ")
    t = re.sub(r"\s+", " ", t).strip()

    # Compound: 1 hour 30 minutes
    m = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*"
        r"(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b",
        t,
    )
    if m:
        return float(m.group(1)) * 3600.0 + float(m.group(2)) * 60.0

    # Compound: 2 minutes 30 seconds
    m = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\s*(?:and\s+)?"
        r"(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b",
        t,
    )
    if m:
        return float(m.group(1)) * 60.0 + float(m.group(2))

    # Colon format: 1:30 or 01:30:00
    # Avoid interpreting aspect ratios like 16:9 or 9:16 as duration.
    m = re.search(r"\b(\d{1,3}):([0-5]\d)(?::([0-5]\d))?\b", t)
    if m:
        raw = m.group(0)
        if raw not in COMMON_ASPECT_RATIOS:
            if m.group(3) is not None:
                h = int(m.group(1))
                mnt = int(m.group(2))
                s = int(m.group(3))
                return h * 3600.0 + mnt * 60.0 + s

            mnt = int(m.group(1))
            s = int(m.group(2))
            return mnt * 60.0 + s

    # Single numeric unit
    patterns = [
        r"\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b",
        r"\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b",
        r"\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|s)\b",
    ]

    for pattern in patterns:
        m = re.search(pattern, t)
        if m:
            value = _unit_seconds(m.group(2))
            if value is not None:
                return float(m.group(1)) * value

    # Half expressions
    if "half an hour" in t or "half hour" in t:
        return 1800.0

    if "half a minute" in t or "half minute" in t:
        return 30.0

    if "half a second" in t:
        return 0.5

    # Written numbers: two minutes, five seconds, a minute
    number_words = "|".join(sorted(WORD_NUMBERS.keys(), key=len, reverse=True))

    for unit_regex, seconds in [
        (r"hours?", 3600.0),
        (r"minutes?", 60.0),
        (r"seconds?", 1.0),
    ]:
        pattern = rf"\b({number_words})\s+{unit_regex}\b"
        m = re.search(pattern, t)
        if m:
            return float(WORD_NUMBERS[m.group(1)]) * seconds

    return None
import re


def split_sentences(text: str) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []

    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def word_count(text: str) -> int:
    return len(text.split())
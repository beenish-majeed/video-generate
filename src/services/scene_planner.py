from dataclasses import dataclass, field
import re
from typing import Optional

from src.config import settings
from src.services.llm import LLMError, LLMProvider, get_llm_provider, is_ollama_reachable


class SceneSafetyError(Exception):
    """Raised when an image prompt violates safety constraints."""
    pass


SAFETY_BLOCKLIST = {
    "nsfw",
    "nude",
    "nudity",
    "naked",
    "porn",
    "pornography",
    "erotic",
    "blood",
    "bloody",
    "gore",
    "murder",
    "kill",
    "killing",
    "weapon",
    "weapons",
    "gun",
    "knife",
    "suicide",
    "terror",
    "terrorist",
    "violence",
    "violent",
    "hate",
    "corpse",
}

SAFETY_DISCLAIMER = (
    "Note: AI-generated visual scenes may be inaccurate, idealized, or contain visual imperfections."
)

ALLOWED_STYLES = {
    "cinematic": "cinematic lighting, 8k resolution, dramatic atmosphere, highly detailed, film still",
    "watercolor": "watercolor painting, soft fluid brushstrokes, pastel colors, artistic paper texture",
    "flat illustration": "clean flat vector illustration, vibrant colors, modern graphic art, minimal design",
    "photo": "realistic photography, natural ambient lighting, 35mm photograph, sharp focus",
}

STOPWORDS = {
    "i", "we", "my", "our", "you", "your", "they", "them", "he", "she", "it",
    "this", "that", "these", "those", "is", "am", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "the", "a",
    "an", "and", "or", "but", "if", "because", "as", "until", "while", "of",
    "at", "by", "for", "with", "about", "against", "between", "into", "through",
    "during", "before", "after", "above", "below", "to", "from", "up", "down",
    "in", "out", "on", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "any",
    "both", "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
    "will", "just", "should", "now", "also", "really", "always", "day",
    "time", "moment", "every", "first", "remember", "think", "wanted", "share",
    "today", "well", "made", "take", "bring", "brings", "much", "many", "feel",
    "feeling", "sure", "come", "comes", "came", "going", "goes", "went", "like",
}


@dataclass
class Scene:
    scene_index: int
    text: str
    start_time: float
    end_time: float
    duration_seconds: float
    image_prompt: str
    key_phrase: str
    style: str
    safety_note: str = SAFETY_DISCLAIMER


@dataclass
class ScenePlan:
    scenes: list[Scene]
    total_duration_seconds: float
    style: str
    safety_note: str = SAFETY_DISCLAIMER


def check_prompt_safety(prompt: str) -> tuple[bool, str]:
    """
    Check prompt against the safety blocklist.
    Returns (is_safe, sanitized_or_original_prompt).
    If unsafe words are found, sanitizes them with a serene landscape replacement.
    """
    words = re.findall(r"\b[a-zA-Z]+\b", prompt.lower())
    found_violations = [w for w in words if w in SAFETY_BLOCKLIST]
    if found_violations:
        # Sanitize by replacing prompt with a peaceful scenic descriptor
        return False, "peaceful scenic landscape with gentle natural light and calm atmosphere"
    return True, prompt


def extract_key_nouns_and_phrase(sentence: str) -> tuple[list[str], str]:
    """
    Extract meaningful subject nouns and a core phrase from a sentence
    without external heavy NLP libraries.
    """
    # Clean punctuation
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", sentence).strip()
    words = cleaned.split()

    # Filter out stopwords and short tokens
    meaningful = [w.lower() for w in words if len(w) > 2 and w.lower() not in STOPWORDS]

    # Deduplicate while preserving order
    nouns: list[str] = []
    seen: set[str] = set()
    for w in meaningful:
        if w not in seen:
            seen.add(w)
            nouns.append(w)

    # Derive key phrase (3-5 words)
    if len(meaningful) >= 3:
        key_phrase = " ".join(meaningful[:4])
    elif len(words) >= 3:
        key_phrase = " ".join(words[:4])
    else:
        key_phrase = sentence.strip()

    return nouns[:5], key_phrase


def build_scene_image_prompt(
    scene_text: str,
    style: str = "cinematic",
    llm_provider: Optional[LLMProvider] = None,
) -> tuple[str, str]:
    """
    Build an image prompt for a scene:
    Uses LLM if available, otherwise extracts key nouns + chosen global style.
    Returns (image_prompt, key_phrase).
    """
    style_key = style.strip().lower() if style else "cinematic"
    style_suffix = ALLOWED_STYLES.get(style_key, ALLOWED_STYLES["cinematic"])

    nouns, key_phrase = extract_key_nouns_and_phrase(scene_text)

    # Try LLM if provider is provided or local Ollama is active
    if llm_provider is not None:
        try:
            sys_msg = (
                "You are an art director describing visual scenes for an illustrator. "
                "Output ONLY a single concise, vivid image description (under 25 words) "
                "focusing on the visual setting, lighting, and objects. No text, dialogue, or captions."
            )
            user_msg = f"Scene text: '{scene_text}'\nVisual style: {style_key}"
            llm_desc = llm_provider.generate(system=sys_msg, user=user_msg, max_tokens=100)
            cleaned_desc = re.sub(r"[\n\r]+", " ", llm_desc).strip().strip('"\'')
            if cleaned_desc and len(cleaned_desc) > 8:
                raw_prompt = f"{cleaned_desc}, {style_suffix}"
                _, safe_prompt = check_prompt_safety(raw_prompt)
                return safe_prompt, key_phrase
        except (LLMError, Exception):
            # Fall back to rule-based noun extraction
            pass

    # Rule-based noun extraction + style string
    if nouns:
        subject_desc = f"{key_phrase}, {', '.join(nouns)}"
    else:
        subject_desc = key_phrase or "scenic tranquil landscape"

    raw_prompt = f"{subject_desc}, {style_suffix}"
    _, safe_prompt = check_prompt_safety(raw_prompt)
    return safe_prompt, key_phrase


def plan_scenes(
    script: str,
    style: str = "cinematic",
    words_per_minute: Optional[float] = None,
    target_scene_min_seconds: float = 5.0,
    target_scene_max_seconds: float = 8.0,
    llm_provider: Optional[LLMProvider] = None,
) -> ScenePlan:
    """
    Split the final script into scenes of about 5 to 8 seconds each
    by sentence boundaries using calibrated words_per_minute speech pacing.
    Generates an image prompt and key phrase for each scene.
    """
    clean_text = script.strip()
    if not clean_text:
        return ScenePlan(scenes=[], total_duration_seconds=0.0, style=style)

    wpm = words_per_minute or settings.words_per_minute
    selected_style = style.strip().lower() if style and style.strip().lower() in ALLOWED_STYLES else "cinematic"

    # Split into sentences preserving terminal punctuation
    raw_sentences = re.split(r"(?<=[.!?])\s+", clean_text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    if not sentences:
        sentences = [clean_text]

    # Calculate duration per sentence
    sentence_data: list[dict] = []
    for s in sentences:
        wc = max(1, len(s.split()))
        dur = (wc / wpm) * 60.0
        sentence_data.append({"text": s, "word_count": wc, "duration": dur})

    # Group sentences into scenes targeting 5.0 to 8.0 seconds
    grouped_scenes_text: list[tuple[str, float]] = []
    current_chunk: list[str] = []
    current_dur: float = 0.0

    for item in sentence_data:
        s_text = item["text"]
        s_dur = item["duration"]

        if not current_chunk:
            current_chunk.append(s_text)
            current_dur = s_dur
        elif current_dur + s_dur <= target_scene_max_seconds:
            current_chunk.append(s_text)
            current_dur += s_dur
        elif current_dur < target_scene_min_seconds:
            # Under minimum, add sentence even if it slightly exceeds target_scene_max_seconds
            current_chunk.append(s_text)
            current_dur += s_dur
            grouped_scenes_text.append((" ".join(current_chunk), current_dur))
            current_chunk = []
            current_dur = 0.0
        else:
            # Current chunk has reached healthy duration (>= 5s)
            grouped_scenes_text.append((" ".join(current_chunk), current_dur))
            current_chunk = [s_text]
            current_dur = s_dur

    if current_chunk:
        # If trailing chunk is very short (< 3.0s) and there is a previous scene, merge with it
        if current_dur < 3.0 and grouped_scenes_text:
            prev_text, prev_dur = grouped_scenes_text.pop()
            grouped_scenes_text.append((f"{prev_text} {' '.join(current_chunk)}", prev_dur + current_dur))
        else:
            grouped_scenes_text.append((" ".join(current_chunk), current_dur))

    # Build Scene objects with timeline offsets and prompts
    scenes: list[Scene] = []
    current_time = 0.0

    for idx, (scene_text, dur) in enumerate(grouped_scenes_text):
        dur_rounded = round(dur, 2)
        end_time = round(current_time + dur_rounded, 2)
        img_prompt, key_phrase = build_scene_image_prompt(
            scene_text=scene_text,
            style=selected_style,
            llm_provider=llm_provider,
        )

        scene = Scene(
            scene_index=idx,
            text=scene_text,
            start_time=round(current_time, 2),
            end_time=end_time,
            duration_seconds=dur_rounded,
            image_prompt=img_prompt,
            key_phrase=key_phrase,
            style=selected_style,
            safety_note=SAFETY_DISCLAIMER,
        )
        scenes.append(scene)
        current_time = end_time

    total_duration = round(current_time, 2)
    return ScenePlan(
        scenes=scenes,
        total_duration_seconds=total_duration,
        style=selected_style,
        safety_note=SAFETY_DISCLAIMER,
    )

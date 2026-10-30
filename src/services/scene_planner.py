from dataclasses import dataclass, field
import re
import uuid
from pathlib import Path
from typing import Optional, Union

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

CAMERA_MOVEMENTS = [
    "static shot",
    "slow pan left to right",
    "gentle slow push in",
    "steady tracking shot",
    "subtle aerial zoom out",
]

LIGHTING_STYLES = [
    "soft natural ambient lighting",
    "golden hour backlight",
    "dramatic cinematic contrast",
    "diffused daylight",
    "warm rim light",
]

DEFAULT_NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, text, watermark, logo, bad anatomy, deformed, oversaturated"
)

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


def build_scene_visual_prompt(
    scene_text: str,
    style: str = "cinematic",
    llm_provider: Optional[LLMProvider] = None,
    scene_index: int = 0,
) -> str:
    """
    Build a rich visual prompt for video generation:
    (subject, setting, camera, lighting, style).
    Applies safety blocklist filtering.
    """
    style_key = style.strip().lower() if style else "cinematic"
    style_suffix = ALLOWED_STYLES.get(style_key, ALLOWED_STYLES["cinematic"])
    camera = CAMERA_MOVEMENTS[scene_index % len(CAMERA_MOVEMENTS)]
    lighting = LIGHTING_STYLES[scene_index % len(LIGHTING_STYLES)]

    subject_desc = ""
    if llm_provider is not None:
        try:
            sys_msg = (
                "You are an art director describing visual scenes for an AI video generator. "
                "Output ONLY a single concise, vivid visual description (under 25 words) "
                "focusing on the visual subject, setting, and environment. "
                "Do NOT include camera movement, lighting, style words, text, or captions."
            )
            user_msg = f"Scene text: '{scene_text}'"
            llm_desc = llm_provider.generate(system=sys_msg, user=user_msg, max_tokens=80)
            cleaned = re.sub(r"[\n\r]+", " ", llm_desc).strip().strip('"\'')
            if cleaned and len(cleaned) > 5:
                subject_desc = cleaned
        except (LLMError, Exception):
            pass

    if not subject_desc:
        nouns, key_phrase = extract_key_nouns_and_phrase(scene_text)
        if nouns:
            subject_desc = f"{key_phrase}, {', '.join(nouns)}"
        else:
            subject_desc = key_phrase or "scenic tranquil landscape"

    raw_prompt = f"{subject_desc}, {camera}, {lighting}, {style_suffix}"
    is_safe, safe_prompt = check_prompt_safety(raw_prompt)
    if not is_safe:
        combined_safe = f"{safe_prompt}, {camera}, {lighting}, {style_suffix}"
        _, final_safe = check_prompt_safety(combined_safe)
        return final_safe
    return safe_prompt


def build_clip_scene_plan(
    script: str,
    style: str = "cinematic",
    audio_asset_id: Optional[str] = None,
    audio_path: Optional[Union[str, Path]] = None,
    tts_provider: Optional[object] = None,
    llm_provider: Optional[LLMProvider] = None,
    words_per_minute: Optional[float] = None,
    target_duration_seconds: Optional[float] = None,
):
    from src.models.schemas import SceneClipItem, ScenePlanResponse
    from src.services.store import get_asset_path
    from src.utils.ffmpeg import probe_duration

    clean_script = script.strip() if script else ""
    if not clean_script:
        plan_id = f"plan_{uuid.uuid4().hex[:12]}"
        return ScenePlanResponse(
            plan_id=plan_id,
            style=style or "cinematic",
            total_duration_seconds=0.0,
            scenes=[],
            plain_text_prompts="",
        )

    base_plan = plan_scenes(
        script=clean_script,
        style=style,
        words_per_minute=words_per_minute,
        llm_provider=llm_provider,
    )

    if not base_plan.scenes:
        plan_id = f"plan_{uuid.uuid4().hex[:12]}"
        return ScenePlanResponse(
            plan_id=plan_id,
            style=base_plan.style,
            total_duration_seconds=0.0,
            scenes=[],
            plain_text_prompts="",
        )

    # Resolve total duration source
    resolved_audio_path: Optional[Path] = None
    if audio_asset_id:
        resolved_audio_path = get_asset_path(audio_asset_id)
        if not resolved_audio_path or not resolved_audio_path.exists():
            raise ValueError(f"Audio asset '{audio_asset_id}' not found.")
    elif audio_path:
        p = Path(audio_path)
        if not p.exists():
            raise ValueError(f"Audio file '{audio_path}' not found.")
        resolved_audio_path = p

    durations: list[float] = []
    if resolved_audio_path is not None:
        audio_dur = round(probe_duration(resolved_audio_path), 2)
        word_counts = [max(1, len(s.text.split())) for s in base_plan.scenes]
        total_words = max(1, sum(word_counts))
        allocated = [round((wc / total_words) * audio_dur, 2) for wc in word_counts]
        diff = round(audio_dur - sum(allocated), 2)
        allocated[-1] = max(0.5, round(allocated[-1] + diff, 2))
        durations = allocated
    elif target_duration_seconds is not None and target_duration_seconds > 0:
        target_dur = round(float(target_duration_seconds), 2)
        word_counts = [max(1, len(s.text.split())) for s in base_plan.scenes]
        total_words = max(1, sum(word_counts))
        allocated = [round((wc / total_words) * target_dur, 2) for wc in word_counts]
        diff = round(target_dur - sum(allocated), 2)
        allocated[-1] = max(0.5, round(allocated[-1] + diff, 2))
        durations = allocated
    elif tts_provider is not None:
        import tempfile
        from src.models.schemas import CompiledPlan, TimelineEvent, VoiceConfig
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            dummy_plan = CompiledPlan(
                job_id=f"plan_{uuid.uuid4().hex[:8]}",
                script=clean_script,
                target_duration_seconds=30.0,
                duration_source="prompt",
                language="en-US",
                voice=VoiceConfig(speed=1.0),
            )
            for idx, s in enumerate(base_plan.scenes):
                ev = TimelineEvent(
                    event_id=f"scene_{idx+1:03d}",
                    start_s=0.0,
                    end_s=s.duration_seconds,
                    type="speech",
                    text=s.text,
                )
                try:
                    seg = tts_provider.synthesize_event(ev, dummy_plan, tmp_path)
                    dur = round(probe_duration(seg.audio_path), 2)
                    durations.append(max(0.5, dur))
                except Exception:
                    durations.append(round(s.duration_seconds, 2))
    else:
        durations = [round(s.duration_seconds, 2) for s in base_plan.scenes]

    clip_scenes: list[SceneClipItem] = []
    text_prompt_blocks: list[str] = []

    for idx, s in enumerate(base_plan.scenes):
        scene_id = f"scene_{idx+1:03d}"
        dur = durations[idx]
        vis_prompt = build_scene_visual_prompt(
            scene_text=s.text,
            style=base_plan.style,
            llm_provider=llm_provider,
            scene_index=idx,
        )
        item = SceneClipItem(
            id=scene_id,
            scene_index=idx,
            narration=s.text,
            visual_prompt=vis_prompt,
            negative_prompt=DEFAULT_NEGATIVE_PROMPT,
            target_clip_seconds=dur,
            aspect_ratio="16:9",
        )
        clip_scenes.append(item)
        text_prompt_blocks.append(
            f"Scene {idx+1} ({scene_id}, {dur:.2f}s, 16:9):\n"
            f"Narration: {s.text}\n"
            f"Prompt: {vis_prompt}\n"
            f"Negative: {DEFAULT_NEGATIVE_PROMPT}\n"
        )

    plan_id = f"plan_{uuid.uuid4().hex[:12]}"
    total_dur_final = round(sum(durations), 2)
    plain_text_prompts = "\n".join(text_prompt_blocks).strip()

    return ScenePlanResponse(
        plan_id=plan_id,
        style=base_plan.style,
        total_duration_seconds=total_dur_final,
        scenes=clip_scenes,
        plain_text_prompts=plain_text_prompts,
    )

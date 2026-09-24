import re
import zlib

from src.config import settings
from src.models.schemas import (
    AspectRatio,
    AvatarParams,
    BackgroundParams,
    CameraParams,
    CompiledPlan,
    SafetyParams,
    SubtitleParams,
    VideoParams,
    VoiceParams,
)
from src.services.duration_parser import parse_duration_seconds
from src.services.timeline_planner import estimate_speech_seconds


SPEED_RULES = [
    ("very slow", 0.75),
    ("slowly", 0.82),
    ("slow", 0.85),
    ("medium-slow", 0.90),
    ("medium slow", 0.90),
    ("natural", 1.00),
    ("normal", 1.00),
    ("medium pace", 1.00),
    ("quickly", 1.20),
    ("fast", 1.25),
    ("energetically", 1.30),
    ("energetic", 1.30),
]

LANGUAGE_MAP = {
    "spanish": "es-ES",
    "french": "fr-FR",
    "german": "de-DE",
    "italian": "it-IT",
    "portuguese": "pt-BR",
    "hindi": "hi-IN",
    "arabic": "ar-SA",
    "japanese": "ja-JP",
    "korean": "ko-KR",
    "chinese": "zh-CN",
    "english": "en-US",
}

CAMERA_RULES = [
    ("medium close-up", "medium_close_up"),
    ("medium close up", "medium_close_up"),
    ("close-up", "close_up"),
    ("close up", "close_up"),
    ("wide shot", "wide_shot"),
    ("medium shot", "medium_shot"),
    ("headshot", "portrait_headshot"),
]


def _resolution_for_aspect(resolution: str, aspect: AspectRatio) -> str:
    try:
        w, h = map(int, resolution.lower().split("x"))
    except Exception:
        w, h = 1280, 720

    ratios = {
        AspectRatio.SIXTEEN_NINE: 16 / 9,
        AspectRatio.NINE_SIXTEEN: 9 / 16,
        AspectRatio.ONE_ONE: 1.0,
        AspectRatio.FOUR_THREE: 4 / 3,
        AspectRatio.FIVE_FOUR: 4 / 5,
    }

    target = ratios.get(aspect, 16 / 9)

    if aspect == AspectRatio.ONE_ONE:
        size = min(w, h)
        size = size - (size % 2)
        return f"{size}x{size}"

    if w > h and target < 1:
        w, h = h, w

    if h > w and target > 1:
        w, h = h, w

    h = int(round(w / target))

    w = w - (w % 2)
    h = h - (h % 2)

    if w <= 0:
        w = 2
    if h <= 0:
        h = 2

    return f"{w}x{h}"


def _apply_overrides(plan: CompiledPlan, overrides: dict) -> CompiledPlan:
    if not overrides:
        return plan

    data = plan.model_dump()

    for key, value in overrides.items():
        try:
            parts = key.split(".")

            if len(parts) == 2 and parts[0] in data and isinstance(data[parts[0]], dict):
                data[parts[0]][parts[1]] = value
            else:
                data[key] = value
        except Exception:
            plan.warnings.append(f"Invalid override ignored: {key}={value}")

    try:
        new_plan = CompiledPlan(**data)
        merged_warnings = list(dict.fromkeys(plan.warnings + new_plan.warnings))
        new_plan.warnings = merged_warnings
        return new_plan
    except Exception as exc:
        plan.warnings.append(f"Overrides invalid and ignored: {exc}")
        return plan


def compile_plan(
    job_id: str,
    script: str,
    prompt: str,
    overrides: dict | None = None,
    max_duration_policy_seconds: float | None = None,
) -> CompiledPlan:
    overrides = overrides or {}
    max_policy = float(max_duration_policy_seconds or settings.max_duration_policy_seconds)

    p = prompt.lower()
    warnings: list[str] = []

    duration = parse_duration_seconds(prompt)

    if duration is None:
        duration = estimate_speech_seconds(script, speed=1.0)
        duration = max(settings.min_duration_seconds, duration)
        source = "script_estimate"
        warnings.append(
            "No explicit duration found in prompt. Duration estimated from script."
        )
    else:
        source = "prompt"

    voice = VoiceParams()

    for phrase, speed_value in SPEED_RULES:
        if phrase in p:
            voice.speed = speed_value
            break

    if any(k in p for k in ["professional", "corporate", "formal"]):
        voice.tone = "professional"
    elif any(k in p for k in ["educational", "training", "explainer"]):
        voice.tone = "educational"
    elif any(k in p for k in ["casual", "friendly", "conversational"]):
        voice.tone = "casual"
    elif any(k in p for k in ["sales", "pitch", "promotional"]):
        voice.tone = "sales"

    if any(k in p for k in ["energetic", "excited", "happy", "smiling"]):
        voice.emotion = "energetic"
    elif any(k in p for k in ["serious", "risk", "security"]):
        voice.emotion = "serious"
    elif any(k in p for k in ["calm", "empathetic", "trustworthy"]):
        voice.emotion = "calm"

    if "pause" in p:
        m = re.search(
            r"pause(?:\s+for)?\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)",
            p,
        )
        if m:
            voice.pauses.after_major_points_ms = int(float(m.group(1)) * 1000)
        elif any(
            k in p
            for k in [
                "between major points",
                "after each section",
                "between sections",
            ]
        ):
            voice.pauses.after_major_points_ms = 1000
        else:
            voice.pauses.after_major_points_ms = 700

    if "no pause" in p or "without pause" in p:
        voice.pauses.after_major_points_ms = 0
        voice.pauses.between_sentences_ms = 0

    if "emphasize" in p or "emphasis" in p:
        if "technical" in p:
            voice.emphasis.mode = "technical_terms"
        else:
            voice.emphasis.mode = "auto_keywords"

    for language_name, language_code in LANGUAGE_MAP.items():
        if language_name in p:
            voice.language = language_code
            break

    if "british english" in p:
        voice.language = "en-GB"

    subtitles = SubtitleParams()

    if any(
        k in p
        for k in [
            "no subtitle",
            "without subtitle",
            "no caption",
            "without caption",
        ]
    ):
        subtitles.enabled = False
    elif any(k in p for k in ["subtitle", "caption", "closed caption"]):
        subtitles.enabled = True

    if "burn" in p:
        subtitles.burn_in = True

    if subtitles.burn_in and not settings.allow_burn_subtitles:
        warnings.append("Subtitle burn-in disabled by server policy.")
        subtitles.burn_in = False

    video = VideoParams(resolution=settings.default_resolution)

    if "4k" in p or "2160" in p:
        video.resolution = "3840x2160"
    elif "1080" in p:
        video.resolution = "1920x1080"
    elif "720" in p:
        video.resolution = "1280x720"

    if "9:16" in p or "vertical" in p:
        video.aspect_ratio = AspectRatio.NINE_SIXTEEN
    elif "1:1" in p or "square" in p:
        video.aspect_ratio = AspectRatio.ONE_ONE
    elif "4:5" in p:
        video.aspect_ratio = AspectRatio.FIVE_FOUR
    elif "4:3" in p:
        video.aspect_ratio = AspectRatio.FOUR_THREE
    else:
        video.aspect_ratio = AspectRatio.SIXTEEN_NINE

    video.resolution = _resolution_for_aspect(video.resolution, video.aspect_ratio)

    camera = CameraParams()

    for phrase, framing in CAMERA_RULES:
        if phrase in p:
            camera.framing = framing
            break

    background = BackgroundParams()

    m = re.search(
        r"background(?:\s+is|\s*:|\s+of)?\s+([^.,;]+)",
        prompt,
        re.IGNORECASE,
    )
    if m:
        background.description = m.group(1).strip()

    avatar = AvatarParams()

    if "smile" in p or "friendly" in p:
        avatar.facial_expression = "friendly smile"
    elif "serious" in p:
        avatar.facial_expression = "serious, focused"
    elif "educational" in p or "training" in p:
        avatar.facial_expression = "attentive, trustworthy"

    safety = SafetyParams()

    seed = zlib.crc32(job_id.encode("utf-8")) & 0xFFFFFFFF

    plan = CompiledPlan(
        job_id=job_id,
        target_duration_seconds=float(duration),
        duration_source=source,
        language=voice.language,
        script=script,
        prompt_original=prompt,
        voice=voice,
        avatar=avatar,
        camera=camera,
        background=background,
        subtitles=subtitles,
        video=video,
        safety=safety,
        seed=seed,
        warnings=warnings,
    )

    plan = _apply_overrides(plan, overrides)

    if plan.target_duration_seconds > max_policy:
        plan.warnings.append(
            f"Requested duration {plan.target_duration_seconds}s exceeds "
            f"policy limit {max_policy}s. Clamped."
        )
        plan.target_duration_seconds = max_policy

    plan.target_duration_seconds = max(
        settings.min_duration_seconds,
        float(plan.target_duration_seconds),
    )

    plan.language = plan.voice.language

    return plan
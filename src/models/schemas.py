from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobState(str, Enum):
    RECEIVED = "RECEIVED"
    CONSENT_PENDING = "CONSENT_PENDING"
    CONSENT_VERIFIED = "CONSENT_VERIFIED"
    COMPILING_PROMPT = "COMPILING_PROMPT"
    PLANNING_TIMELINE = "PLANNING_TIMELINE"
    PREPARING_IDENTITY = "PREPARING_IDENTITY"
    SYNTHESIZING_AUDIO = "SYNTHESIZING_AUDIO"
    SCHEDULING_SEGMENTS = "SCHEDULING_SEGMENTS"
    GENERATING_SEGMENTS = "GENERATING_SEGMENTS"
    QA_CHECKING = "QA_CHECKING"
    ASSEMBLING = "ASSEMBLING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AspectRatio(str, Enum):
    SIXTEEN_NINE = "16:9"
    NINE_SIXTEEN = "9:16"
    ONE_ONE = "1:1"
    FOUR_THREE = "4:3"
    FIVE_FOUR = "4:5"


class ConsentRequest(BaseModel):
    authorized: bool
    statement: str
    face_rights_attested: Optional[bool] = None
    voice_rights_attested: Optional[bool] = None
    ai_generated_accepted: Optional[bool] = None
    ai_label_accepted: Optional[bool] = None


class ConsentRecord(BaseModel):
    consent_id: str
    job_id: str
    authorized: bool
    statement: str
    timestamp: datetime = Field(default_factory=utcnow)
    photo_sha256: str
    voice_sha256: str


class PausePolicy(BaseModel):
    between_sentences_ms: int = 350
    after_major_points_ms: int = 0
    custom_events: list[dict] = Field(default_factory=list)


class EmphasisPolicy(BaseModel):
    mode: Literal["none", "auto_keywords", "explicit_markup", "technical_terms"] = "none"
    words: list[str] = Field(default_factory=list)


class PronunciationRule(BaseModel):
    text: str
    phonemes: Optional[str] = None
    alias: Optional[str] = None


class VoiceParams(BaseModel):
    language: str = "en-US"
    speed: float = 1.0
    pitch: float = 0.0
    tone: str = "natural"
    emotion: str = "neutral"
    pauses: PausePolicy = Field(default_factory=PausePolicy)
    emphasis: EmphasisPolicy = Field(default_factory=EmphasisPolicy)
    pronunciation_rules: list[PronunciationRule] = Field(default_factory=list)
    ssml_enabled: bool = True


class ExpressionEvent(BaseModel):
    time_start_s: Optional[float] = None
    time_end_s: Optional[float] = None
    trigger_text: Optional[str] = None
    expression: str
    intensity: float = 0.5


class AvatarParams(BaseModel):
    facial_expression: str = "neutral, friendly"
    expression_events: list[ExpressionEvent] = Field(default_factory=list)
    head_motion: str = "subtle natural movement"
    blink_style: str = "natural"
    gaze: str = "camera"
    identity_lock_strength: float = 0.95
    minimize_drift: bool = True


class CameraParams(BaseModel):
    framing: Literal[
        "close_up",
        "medium_close_up",
        "medium_shot",
        "wide_shot",
        "portrait_headshot",
    ] = "medium_close_up"
    angle: str = "eye-level"
    movement: str = "static or very subtle push-in"
    lens_style: str = "natural 50mm equivalent"


class BackgroundParams(BaseModel):
    description: str = "clean professional background, softly blurred"
    consistency: Literal["fixed_plate", "generated_once", "user_image"] = "fixed_plate"
    blur: float = 0.35
    lighting_match: bool = True


class SubtitleParams(BaseModel):
    enabled: bool = True
    style: str = "clean white text with dark shadow"
    position: str = "bottom_center"
    language: str = "same_as_script"
    burn_in: bool = False


class VideoParams(BaseModel):
    resolution: str = "1280x720"
    aspect_ratio: AspectRatio = AspectRatio.SIXTEEN_NINE
    fps: int = 30
    codec: str = "h264"
    audio_codec: str = "aac"
    pixel_format: str = "yuv420p"


class SafetyParams(BaseModel):
    visible_label: bool = True
    label_text: str = "AI-generated"
    c2pa: bool = True
    provenance_metadata: bool = True


class CompiledPlan(BaseModel):
    job_id: str
    target_duration_seconds: float
    duration_source: Literal["prompt", "script_estimate", "user_override", "inferred"]
    language: str
    script: str
    prompt_original: str

    voice: VoiceParams = Field(default_factory=VoiceParams)
    avatar: AvatarParams = Field(default_factory=AvatarParams)
    camera: CameraParams = Field(default_factory=CameraParams)
    background: BackgroundParams = Field(default_factory=BackgroundParams)
    subtitles: SubtitleParams = Field(default_factory=SubtitleParams)
    video: VideoParams = Field(default_factory=VideoParams)
    safety: SafetyParams = Field(default_factory=SafetyParams)

    seed: int = 123456
    warnings: list[str] = Field(default_factory=list)


class TimelineEvent(BaseModel):
    event_id: str
    type: Literal["speech", "pause", "hold"]
    start_s: float
    end_s: float
    text: Optional[str] = None
    pause_ms: Optional[int] = None
    expression: Optional[str] = None


class Timeline(BaseModel):
    events: list[TimelineEvent] = Field(default_factory=list)
    total_duration_seconds: float = 0.0


class TTSSegment(BaseModel):
    event_id: str
    audio_path: str
    duration_seconds: float
    word_timestamps: list[dict] = Field(default_factory=list)


class SegmentSpec(BaseModel):
    segment_id: str
    index: int
    start_s: float
    end_s: float
    duration_s: float
    text: str = ""
    events: list[TimelineEvent] = Field(default_factory=list)
    audio_path: Optional[str] = None
    video_path: Optional[str] = None


import math
from src.config import settings
from pydantic import BaseModel, Field, field_validator, model_validator


DURATION_PRESETS: dict[str, float] = {
    "5s": 5.0,
    "30s": 30.0,
    "1m": 60.0,
    "2m": 120.0,
    "3m": 180.0,
    "5m": 300.0,
    "10m": 600.0,
}


class JobCreate(BaseModel):
    photo_asset_id: Optional[str] = None
    voice_asset_id: Optional[str] = None
    avatar_preset_id: Optional[str] = None
    voice_preset_id: Optional[str] = None
    script: Optional[str] = ""
    prompt: Optional[str] = ""
    consent: ConsentRequest
    target_duration_seconds: Optional[float] = None
    duration_preset: Optional[str] = None
    overrides: dict = Field(default_factory=dict)
    visual_mode: Literal["talking_head", "slideshow"] = "talking_head"
    burn_subtitles: Optional[bool] = None
    subtitles_enabled: Optional[bool] = None
    bg_music_asset_id: Optional[str] = None
    bg_music_volume: float = 0.2
    image_style: Optional[str] = "cinematic"

    # "My own images and audio" mode fields
    uploaded_image_asset_ids: list[str] = Field(default_factory=list)
    image_durations: Optional[list[float]] = None
    uploaded_audio_asset_id: Optional[str] = None
    prefer_lip_sync: bool = False
    auto_subtitles: bool = False

    @field_validator("visual_mode")
    @classmethod
    def validate_visual_mode(cls, v: str) -> str:
        if not v:
            return "talking_head"
        norm = v.strip().lower().replace(" ", "_")
        if norm not in ("talking_head", "slideshow"):
            raise ValueError(f"Invalid visual_mode '{v}'. Allowed modes: 'talking_head', 'slideshow'")
        return norm

    @field_validator("avatar_preset_id")
    @classmethod
    def validate_avatar_preset_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip()
        from src.services.presets import is_valid_avatar_preset_id, get_allowed_avatar_preset_ids
        if not is_valid_avatar_preset_id(v_clean):
            raise ValueError(f"Unknown avatar_preset_id '{v}'. Allowed presets: {sorted(get_allowed_avatar_preset_ids())}")
        return v_clean

    @field_validator("voice_preset_id")
    @classmethod
    def validate_voice_preset_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip()
        from src.services.presets import is_valid_voice_preset_id, get_allowed_voice_preset_ids
        if not is_valid_voice_preset_id(v_clean):
            raise ValueError(f"Unknown voice_preset_id '{v}'. Allowed presets: {sorted(get_allowed_voice_preset_ids())}")
        return v_clean

    @model_validator(mode="after")
    def validate_asset_sources(self) -> "JobCreate":
        has_uploads = bool(self.photo_asset_id and self.voice_asset_id)
        has_presets = bool(self.avatar_preset_id and self.voice_preset_id)

        if not has_uploads and not has_presets:
            n_images = len(self.uploaded_image_asset_ids) if self.uploaded_image_asset_ids is not None else 0
            if n_images < 1 or n_images > 30:
                raise ValueError(
                    f"uploaded_image_asset_ids must contain between 1 and 30 images (got {n_images})."
                )

        has_my_own = bool(self.uploaded_image_asset_ids)
        if has_my_own:
            n_images = len(self.uploaded_image_asset_ids)
            if n_images < 1 or n_images > 30:
                raise ValueError(
                    f"uploaded_image_asset_ids must contain between 1 and 30 images (got {n_images})."
                )

            if self.image_durations is not None:
                if len(self.image_durations) != n_images:
                    raise ValueError(
                        f"image_durations count ({len(self.image_durations)}) must match uploaded_image_asset_ids count ({n_images})."
                    )
                for i, d in enumerate(self.image_durations):
                    if d < 2.0:
                        raise ValueError(
                            f"Per-image duration must be at least 2.0s (image {i} got {d:.2f}s)."
                        )

            if not self.uploaded_audio_asset_id and not (self.script and self.script.strip()):
                raise ValueError(
                    "Either uploaded_audio_asset_id or a typed script must be provided for my own images mode."
                )

        return self

    @field_validator("duration_preset")
    @classmethod
    def validate_preset(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip().lower()
        if v_clean not in DURATION_PRESETS:
            raise ValueError(f"Invalid duration_preset '{v}'. Allowed presets: {sorted(DURATION_PRESETS.keys())}")
        seconds = DURATION_PRESETS[v_clean]
        if seconds < settings.min_duration_seconds or seconds > settings.max_duration_policy_seconds:
            raise ValueError(
                f"duration_preset '{v}' ({seconds}s) is outside policy limits "
                f"({settings.min_duration_seconds}s - {settings.max_duration_policy_seconds}s)."
            )
        return v_clean

    @field_validator("target_duration_seconds")
    @classmethod
    def validate_duration_seconds(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if v < settings.min_duration_seconds:
            raise ValueError(
                f"target_duration_seconds ({v}s) is below minimum allowed ({settings.min_duration_seconds}s)."
            )
        if v > settings.max_duration_policy_seconds:
            raise ValueError(
                f"target_duration_seconds ({v}s) exceeds maximum policy limit ({settings.max_duration_policy_seconds}s)."
            )
        return v

    def resolve_target_duration_seconds(self) -> Optional[float]:
        if self.target_duration_seconds is not None:
            return self.target_duration_seconds
        if self.duration_preset is not None:
            return DURATION_PRESETS.get(self.duration_preset.strip().lower())
        return None

    @model_validator(mode="after")
    def validate_script_length_against_duration(self) -> "JobCreate":
        # If user uploaded audio, audio length is the timeline authority; skip script check
        if self.uploaded_audio_asset_id:
            return self

        target_seconds = self.resolve_target_duration_seconds()
        if target_seconds is None:
            return self

        script_text = self.script or ""
        words = len(script_text.split())
        wpm = settings.words_per_minute
        est_duration = (words / wpm) * 60.0 if words > 0 else 0.0
        min_required_duration = target_seconds * 0.90

        if est_duration < min_required_duration:
            min_required_words = int(math.ceil((min_required_duration / 60.0) * wpm))
            raise ValueError(
                f"Script has {words} words (~{est_duration:.1f}s speech), but requested duration "
                f"({target_seconds:.1f}s) requires at least {min_required_words} words."
            )
        return self




class JobRecord(BaseModel):
    job_id: str
    state: JobState = JobState.RECEIVED
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    request: JobCreate
    photo_path: Optional[str] = ""
    voice_path: Optional[str] = ""

    consent: Optional[ConsentRecord] = None
    plan: Optional[CompiledPlan] = None
    timeline: Optional[Timeline] = None
    segments: list[SegmentSpec] = Field(default_factory=list)

    identity_pack: Optional[dict] = None
    voice_pack: Optional[dict] = None

    visual_mode_used: Optional[str] = None
    visual_mode_reason: Optional[str] = None

    output_path: Optional[str] = None
    subtitle_path: Optional[str] = None
    error: Optional[str] = None


class ScriptGenerateRequest(BaseModel):
    prompt: str = Field(..., max_length=1000)
    duration_preset: Optional[str] = None
    target_duration_seconds: Optional[float] = None
    tone: Optional[str] = "friendly"
    language: Optional[str] = "en"

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        clean = v.strip() if v else ""
        if not clean:
            raise ValueError("prompt cannot be empty.")
        if len(clean) > 1000:
            raise ValueError(f"prompt length ({len(clean)}) exceeds maximum allowed 1000 characters.")
        return clean

    @field_validator("duration_preset")
    @classmethod
    def validate_preset(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip().lower()
        if v_clean not in DURATION_PRESETS:
            raise ValueError(f"Invalid duration_preset '{v}'. Allowed presets: {sorted(DURATION_PRESETS.keys())}")
        seconds = DURATION_PRESETS[v_clean]
        if seconds < settings.min_duration_seconds or seconds > settings.max_duration_policy_seconds:
            raise ValueError(
                f"duration_preset '{v}' ({seconds}s) is outside policy limits "
                f"({settings.min_duration_seconds}s - {settings.max_duration_policy_seconds}s)."
            )
        return v_clean

    @field_validator("target_duration_seconds")
    @classmethod
    def validate_duration_seconds(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if v < settings.min_duration_seconds:
            raise ValueError(
                f"target_duration_seconds ({v}s) is below minimum allowed ({settings.min_duration_seconds}s)."
            )
        if v > settings.max_duration_policy_seconds:
            raise ValueError(
                f"target_duration_seconds ({v}s) exceeds maximum policy limit ({settings.max_duration_policy_seconds}s)."
            )
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return "friendly"
        v_clean = v.strip().lower()
        allowed = {"friendly", "professional", "storytelling", "educational"}
        if v_clean not in allowed:
            raise ValueError(f"Invalid tone '{v}'. Allowed tones: {sorted(allowed)}")
        return v_clean

    def resolve_target_duration_seconds(self) -> float:
        if self.target_duration_seconds is not None:
            return self.target_duration_seconds
        if self.duration_preset is not None:
            return DURATION_PRESETS[self.duration_preset.strip().lower()]
        raise ValueError("Either 'duration_preset' or 'target_duration_seconds' must be provided.")

    @model_validator(mode="after")
    def validate_duration_presence(self) -> "ScriptGenerateRequest":
        if self.duration_preset is None and self.target_duration_seconds is None:
            raise ValueError("Either 'duration_preset' or 'target_duration_seconds' must be provided.")
        return self


class ScriptGenerateResponse(BaseModel):
    script: str
    word_count: int
    estimated_seconds: float
    target_words: int
    script_source: str = "template"
from __future__ import annotations

import re
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
    CANCELLED = "CANCELLED"


JOB_ID_PATTERN = re.compile(r"^job_([0-9a-fA-F]{12}|[0-9a-fA-F]{32}|[a-zA-Z0-9_\-]+)$")
ASSET_ID_PATTERN = re.compile(r"^(photo|voice|image|audio|music)_([0-9a-fA-F]{12}|[0-9a-fA-F]{32}|[a-zA-Z0-9_\-]+)$")


def is_valid_job_id(job_id: str | None) -> bool:
    if not job_id or not isinstance(job_id, str):
        return False
    return bool(JOB_ID_PATTERN.match(job_id))


def is_valid_asset_id(asset_id: str | None) -> bool:
    if not asset_id or not isinstance(asset_id, str):
        return False
    return bool(ASSET_ID_PATTERN.match(asset_id))


class AspectRatio(str, Enum):
    SIXTEEN_NINE = "16:9"
    NINE_SIXTEEN = "9:16"
    ONE_ONE = "1:1"
    FOUR_THREE = "4:3"
    FIVE_FOUR = "4:5"


class ConsentRequest(BaseModel):
    authorized: bool
    statement: str = Field(default="", exclude=True)
    consent_version: str = "v1.0"
    face_rights_attested: Optional[bool] = None
    voice_rights_attested: Optional[bool] = None
    ai_generated_accepted: Optional[bool] = None
    ai_label_accepted: Optional[bool] = None
    clips_rights_attested: Optional[bool] = None


class ConsentRecord(BaseModel):
    consent_id: str
    job_id: str
    authorized: bool
    consent_version: str = "v1.0"
    timestamp: datetime = Field(default_factory=utcnow)
    photo_sha256: str
    voice_sha256: str
    statement: Optional[str] = Field(default=None, exclude=True)
    clips_sha256: list[str] = Field(default_factory=list)


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

    @classmethod
    def validate_resolution_str(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("resolution must be a string")
        m = re.match(r"^(\d{2,4})x(\d{2,4})$", v.strip())
        if not m:
            raise ValueError(
                f"Invalid resolution format '{v}'. Expected format 'WIDTHxHEIGHT' with digits only (e.g. '1280x720')."
            )
        w, h = int(m.group(1)), int(m.group(2))
        if w < 64 or w > 4096 or h < 64 or h > 4096:
            raise ValueError(f"Resolution {w}x{h} outside acceptable bounds [64-4096].")
        return f"{w}x{h}"

    def __init__(self, **data):
        if "resolution" in data and isinstance(data["resolution"], str):
            data["resolution"] = self.validate_resolution_str(data["resolution"])
        super().__init__(**data)


class SafetyParams(BaseModel):
    visible_label: bool = True
    label_text: str = "AI-generated"
    # Provenance metadata tags written with FFmpeg, not a signed C2PA manifest
    c2pa: bool = Field(
        default=False,
        description="provenance metadata tags written with FFmpeg, not a signed C2PA manifest",
    )
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

    music_asset_id: Optional[str] = None
    music_preset_id: Optional[str] = None
    music_volume: float = 0.25
    music_ducking: bool = True
    music_applied: Optional[bool] = None
    music_error: Optional[str] = None

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
    """
    Job creation schema.
    User must possess all necessary rights, licenses, and permissions for any uploaded music.
    """
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
    visual_mode: Literal[
        "talking_head",
        "text_to_video",
        "picture_to_video",
        "slideshow",
        "ai_clips",
    ] = "talking_head"
    audio_mode: Literal["ai_generated", "original_audio"] = Field(
        default="ai_generated",
        description="Audio mode for video generation. Defaults to 'ai_generated'. Can be 'original_audio' if user uploads audio.",
    )
    clip_asset_ids: list[str] = Field(default_factory=list, description="Ordered clip asset IDs for ai_clips mode.")
    plan_id: Optional[str] = Field(default=None, description="Optional associated scene plan ID.")
    burn_subtitles: Optional[bool] = None
    subtitles_enabled: Optional[bool] = None

    # Background music options
    music_asset_id: Optional[str] = Field(
        default=None,
        description="Optional asset ID of background music. User must possess all necessary rights to the music they upload.",
    )
    music_preset_id: Optional[str] = Field(
        default=None,
        description="Optional ID of ambient music preset ('calm', 'warm', 'bright'). Alternative to music_asset_id.",
    )
    music_volume: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description="Music volume scaling factor from 0.0 to 1.0 (default 0.25).",
    )
    music_ducking: bool = Field(
        default=True,
        description="Whether to duck background music under speech audio using sidechain compression (default True).",
    )

    # Backward compatibility aliases
    bg_music_asset_id: Optional[str] = None
    bg_music_volume: Optional[float] = None
    image_style: Optional[str] = "cinematic"

    # "My own images and audio" mode fields
    uploaded_image_asset_ids: list[str] = Field(default_factory=list)
    image_durations: Optional[list[float]] = None
    uploaded_audio_asset_id: Optional[str] = None
    prefer_lip_sync: bool = False
    auto_subtitles: bool = False

    @model_validator(mode="before")
    @classmethod
    def sync_music_fields(cls, data: any) -> any:
        if isinstance(data, dict):
            if data.get("bg_music_asset_id") and not data.get("music_asset_id"):
                data["music_asset_id"] = data["bg_music_asset_id"]
            elif data.get("music_asset_id") and not data.get("bg_music_asset_id"):
                data["bg_music_asset_id"] = data["music_asset_id"]

            if data.get("bg_music_volume") is not None and data.get("music_volume") is None:
                data["music_volume"] = data["bg_music_volume"]
            elif data.get("music_volume") is not None and data.get("bg_music_volume") is None:
                data["bg_music_volume"] = data["music_volume"]
        return data

    @field_validator("music_asset_id")
    @classmethod
    def validate_music_asset_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip()
        if not v_clean:
            return None
        from src.services.store import get_asset_path
        asset_path = get_asset_path(v_clean)
        if asset_path is None or not asset_path.exists():
            raise ValueError(f"Unknown music_asset_id '{v}'. Asset does not exist.")
        return v_clean

    @field_validator("music_preset_id")
    @classmethod
    def validate_music_preset_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v_clean = v.strip().lower()
        if not v_clean:
            return None
        from src.services.music_presets import is_valid_music_preset_id, get_allowed_preset_ids
        if not is_valid_music_preset_id(v_clean):
            raise ValueError(
                f"Unknown music_preset_id '{v}'. Allowed presets: {sorted(get_allowed_preset_ids())}"
            )
        return v_clean

    @property
    def canonical_mode(self) -> str:
        """Resolve to strictly one of the two canonical generation modes."""
        if self.visual_mode in ("picture_to_video", "talking_head"):
            return "picture_to_video"
        return "text_to_video"

    @field_validator("visual_mode")
    @classmethod
    def validate_visual_mode(cls, v: str) -> str:
        if not v:
            return "talking_head"
        norm = v.strip().lower().replace(" ", "_").replace("-", "_")
        # Canonical mappings
        if norm in ("text_to_video", "text2video", "t2v"):
            return "text_to_video"
        if norm in ("picture_to_video", "image_to_video", "photo_to_video", "p2v", "i2v"):
            return "picture_to_video"
        # Legacy mappings
        if norm in ("talking_head", "slideshow", "ai_clips"):
            return norm
        raise ValueError(
            f"Invalid visual_mode '{v}'. Allowed canonical modes: 'text_to_video', 'picture_to_video' "
            f"(legacy aliases: 'slideshow', 'talking_head', 'ai_clips')."
        )

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

    @field_validator("overrides")
    @classmethod
    def validate_overrides(cls, v: dict) -> dict:
        if not isinstance(v, dict):
            raise ValueError("overrides must be a dictionary")

        def _check_key(key: str, path: str = "") -> None:
            full_key = f"{path}.{key}" if path else str(key)
            k_norm = re.sub(r"[._\- ]+", "", str(key).lower())
            forbidden = ("safety", "label", "watermark", "consent")
            if any(term in k_norm for term in forbidden):
                raise ValueError(
                    f"Overrides cannot modify safety, label, watermark, or consent settings: '{full_key}'"
                )

        def _traverse(d: dict, path: str = "") -> None:
            for k, val in d.items():
                _check_key(k, path)
                if isinstance(val, dict):
                    _traverse(val, f"{path}.{k}" if path else str(k))

        _traverse(v)

        res = v.get("video.resolution")
        if res is None and isinstance(v.get("video"), dict):
            res = v.get("video", {}).get("resolution")
        if res is not None:
            VideoParams.validate_resolution_str(str(res))
        return v

    @model_validator(mode="after")
    def validate_asset_sources(self) -> "JobCreate":
        if self.visual_mode == "ai_clips":
            n_clips = len(self.clip_asset_ids) if self.clip_asset_ids is not None else 0
            if n_clips < 1 or n_clips > 60:
                raise ValueError(f"clip_asset_ids must contain between 1 and 60 clips (got {n_clips}).")
            if not self.uploaded_audio_asset_id and not self.voice_asset_id and not self.voice_preset_id and not (self.script and self.script.strip()):
                raise ValueError("Either an audio asset, voice preset, or typed script must be provided for ai_clips mode.")
            return self

        # Canonical Mode 1: text_to_video
        if self.visual_mode == "text_to_video":
            has_text = bool((self.prompt and self.prompt.strip()) or (self.script and self.script.strip()))
            if not has_text:
                raise ValueError("Either 'prompt' or 'script' must be provided for text_to_video mode.")
            return self

        # Canonical Mode 2: picture_to_video
        if self.visual_mode == "picture_to_video":
            has_image = bool(
                self.photo_asset_id
                or self.avatar_preset_id
                or (self.uploaded_image_asset_ids and len(self.uploaded_image_asset_ids) > 0)
            )
            if not has_image:
                raise ValueError(
                    "An image must be provided for picture_to_video mode (via photo_asset_id, avatar_preset_id, or uploaded_image_asset_ids)."
                )
            if self.uploaded_audio_asset_id:
                object.__setattr__(self, "audio_mode", "original_audio")
            return self

        has_uploads = bool(self.photo_asset_id and self.voice_asset_id)
        has_presets = bool(self.avatar_preset_id and self.voice_preset_id)
        has_prompt_flow = bool(self.visual_mode == "slideshow" and (self.voice_preset_id or self.voice_asset_id or self.prompt))

        if not has_uploads and not has_presets and not has_prompt_flow:
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

        # In prompt-driven mode or text_to_video where prompt is provided and script is omitted,
        # AI script synthesis handles script generation to match target duration.
        if (self.prompt and self.prompt.strip()) and not (self.script and self.script.strip()):
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

    @model_validator(mode="after")
    def validate_music_mutual_exclusion(self) -> "JobCreate":
        if self.music_asset_id and self.music_preset_id:
            raise ValueError(
                "Providing both 'music_asset_id' and 'music_preset_id' is not allowed. "
                "Choose either an uploaded asset or an ambient preset."
            )
        return self




class JobRecord(BaseModel):
    job_id: str
    session_id: Optional[str] = Field(default=None, description="Cryptographically verified anonymous visitor session identifier.")
    client_id: Optional[str] = Field(default=None, description="Client or tenant identifier for cross-user IDOR access control.")
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
    clip_asset_ids: list[str] = Field(default_factory=list)
    plan_id: Optional[str] = None

    music_asset_id: Optional[str] = None
    music_preset_id: Optional[str] = None
    music_volume: Optional[float] = None
    music_ducking: Optional[bool] = None
    music_applied: Optional[bool] = None
    music_error: Optional[str] = None
    music_failure_reason: Optional[str] = None

    output_path: Optional[str] = None
    subtitle_path: Optional[str] = None
    error: Optional[str] = None

    estimated_render_seconds: Optional[float] = None
    retention_expires_at: Optional[datetime] = None
    voice_cloning_disclaimer: str = (
        "Local Piper TTS synthesizes scripts using built-in offline voices; uploaded voice samples are not cloned."
    )


class JobEstimateRequest(BaseModel):
    target_duration_seconds: float = Field(..., ge=1.0, le=900.0)
    visual_mode: str = Field(
        "talking_head",
        pattern="^(text_to_video|picture_to_video|talking_head|slideshow|ai_clips)$",
    )


class JobEstimateResponse(BaseModel):
    target_duration_seconds: float
    visual_mode: str
    estimated_render_seconds: float
    estimated_render_human: str
    compute_advisory: str
    retention_policy_hours: float
    voice_cloning_note: str


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

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: Optional[str]) -> str:
        if v is None:
            return "en"
        clean = v.strip()
        if not clean:
            return "en"
        if len(clean) > 16 or not re.match(r"^[a-zA-Z]{2,4}(-[a-zA-Z0-9]{2,4})?$", clean):
            raise ValueError(f"Invalid language '{v}'. Must be a valid language code (e.g. 'en', 'en-US').")
        return clean

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


class SceneClipItem(BaseModel):
    id: str
    scene_index: int
    narration: str
    visual_prompt: str
    negative_prompt: str
    target_clip_seconds: float
    aspect_ratio: str = "16:9"


class ScenePlanRequest(BaseModel):
    script: str = Field(..., max_length=5000)
    style: Optional[str] = "cinematic"
    audio_asset_id: Optional[str] = None
    target_duration_seconds: Optional[float] = None

    @field_validator("script")
    @classmethod
    def validate_script(cls, v: str) -> str:
        clean = v.strip() if v else ""
        if not clean:
            raise ValueError("script cannot be empty.")
        if len(clean) > 5000:
            raise ValueError(f"script length ({len(clean)}) exceeds maximum allowed 5000 characters.")
        return clean

    @field_validator("style")
    @classmethod
    def validate_style(cls, v: Optional[str]) -> str:
        if v is None:
            return "cinematic"
        clean = v.strip().lower()
        from src.services.scene_planner import ALLOWED_STYLES
        if clean not in ALLOWED_STYLES:
            raise ValueError(f"Invalid style '{v}'. Allowed styles: {sorted(ALLOWED_STYLES.keys())}")
        return clean


class ScenePlanResponse(BaseModel):
    plan_id: str
    style: str
    total_duration_seconds: float
    scenes: list[SceneClipItem]
    plain_text_prompts: str

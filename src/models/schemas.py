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
    face_rights_attested: bool
    voice_rights_attested: bool


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


class JobCreate(BaseModel):
    photo_asset_id: str
    voice_asset_id: str
    script: str
    prompt: str
    consent: ConsentRequest
    overrides: dict = Field(default_factory=dict)


class JobRecord(BaseModel):
    job_id: str
    state: JobState = JobState.RECEIVED
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    request: JobCreate
    photo_path: str
    voice_path: str

    consent: Optional[ConsentRecord] = None
    plan: Optional[CompiledPlan] = None
    timeline: Optional[Timeline] = None
    segments: list[SegmentSpec] = Field(default_factory=list)

    identity_pack: Optional[dict] = None
    voice_pack: Optional[dict] = None

    output_path: Optional[str] = None
    subtitle_path: Optional[str] = None
    error: Optional[str] = None
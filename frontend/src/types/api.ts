/**
 * API Contract types for Video Generation Backend (FastAPI)
 */

export type DurationPreset = '5s' | '30s' | '1m' | '2m' | '3m' | '5m' | '10m';

export interface DurationOption {
  label: string;
  value: DurationPreset;
  seconds: number;
}

export interface DurationsResponse {
  words_per_minute: number;
  min_duration_seconds: number;
  max_duration_policy_seconds: number;
  allowed_presets: DurationOption[];
}

export type AssetKind = 'photo' | 'voice';

export interface AssetUploadResponse {
  asset_id: string;
  kind: AssetKind;
  filename: string;
  mime_type: string;
  size_bytes: number;
  path: string;
  sha256: string;
}

export interface AvatarPreset {
  id: string;
  name: string;
  thumbnail_url: string;
}

export interface VoicePreset {
  id: string;
  name: string;
  sample_url?: string;
}

export interface PresetsResponse {
  avatars: AvatarPreset[];
  voices: VoicePreset[];
}

export type ScriptTone = 'friendly' | 'professional' | 'storytelling' | 'educational';

export interface ScriptGeneratePayload {
  prompt: string;
  duration_preset?: DurationPreset;
  target_duration_seconds?: number;
  tone?: ScriptTone;
  language?: string;
}

export interface ScriptGenerateResponse {
  script: string;
  word_count: number;
  estimated_seconds: number;
  target_words: number;
}

export interface ConsentPayload {
  authorized: boolean;
  statement: string;
  face_rights_attested?: boolean;
  voice_rights_attested?: boolean;
  ai_generated_accepted?: boolean;
  ai_label_accepted?: boolean;
}

export interface JobCreatePayload {
  photo_asset_id?: string;
  voice_asset_id?: string;
  avatar_preset_id?: string;
  voice_preset_id?: string;
  script: string;
  prompt?: string;
  consent: ConsentPayload;
  duration_preset?: DurationPreset;
  target_duration_seconds?: number;
  overrides?: Record<string, unknown>;
}

export type JobState =
  | 'RECEIVED'
  | 'CONSENT_PENDING'
  | 'CONSENT_VERIFIED'
  | 'COMPILING_PROMPT'
  | 'PLANNING_TIMELINE'
  | 'PREPARING_IDENTITY'
  | 'SYNTHESIZING_AUDIO'
  | 'SCHEDULING_SEGMENTS'
  | 'GENERATING_SEGMENTS'
  | 'QA_CHECKING'
  | 'ASSEMBLING'
  | 'COMPLETED'
  | 'FAILED';

export interface SegmentProgress {
  index: number;
  total: number;
  state?: string;
  label?: string;
  progress?: number;
}

export interface JobRecord {
  job_id: string;
  state: JobState;
  status: JobState;
  created_at: string;
  updated_at: string;
  error?: string | null;
  result_video_path?: string | null;
  target_duration_seconds?: number;
  audio_duration_seconds?: number;
  final_video_duration_seconds?: number;
  segments?: SegmentProgress[];
  consent?: ConsentPayload;
  script?: string;
  photo_asset_id?: string;
  voice_asset_id?: string;
}

export interface APIErrorResponse {
  detail?: string | Array<{ loc: string[]; msg: string; type: string }>;
  error?: string;
  message?: string;
}

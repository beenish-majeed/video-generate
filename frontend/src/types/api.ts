/**
 * API Contract types for Video Generation Backend (FastAPI)
 */

export type DurationPreset = '5s' | '30s' | '2m' | '5m' | '10m';

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

export interface ConsentPayload {
  authorized: boolean;
  statement: string;
  face_rights_attested: boolean;
  voice_rights_attested: boolean;
}

export interface JobCreatePayload {
  photo_asset_id: string;
  voice_asset_id: string;
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

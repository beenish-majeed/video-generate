import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../api/client';
import { analyzeScriptWords } from '../utils/scriptWordCount';
import { mapJobStateToStory } from '../utils/jobStateMapper';
import { getPollingInterval, isTerminalState } from '../utils/pollingStrategy';
import type { DurationsResponse, AssetUploadResponse, JobRecord } from '../types/api';

describe('End-to-End Happy Path Workflow (Mocked Backend API)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executes full happy-path journey: durations -> assets -> job creation -> polling -> completion', async () => {
    // 1. Fetch Durations
    const mockDurations: DurationsResponse = {
      allowed_presets: [
        { label: '5s', value: '5s', seconds: 5 },
        { label: '30s', value: '30s', seconds: 30 },
      ],
      words_per_minute: 150,
      min_duration_seconds: 5,
      max_duration_policy_seconds: 300,
    };
    vi.spyOn(apiClient, 'getDurations').mockResolvedValue(mockDurations);

    const durations = await apiClient.getDurations();
    expect(durations.allowed_presets).toHaveLength(2);
    expect(durations.words_per_minute).toBe(150);

    // 2. Validate Script Word Count Bounds for 30s target @ 150 WPM
    const validScript = Array.from({ length: 72 }, (_, i) => `word${i}`).join(' ');
    const scriptAnalysis = analyzeScriptWords(validScript, 30, durations.words_per_minute);
    expect(scriptAnalysis.isWithinBounds).toBe(true);
    expect(scriptAnalysis.status).toBe('perfect');

    // 3. Asset Uploads (Photo & Voice)
    const photoUploadRes: AssetUploadResponse = {
      asset_id: 'photo-asset-123',
      kind: 'photo',
      filename: 'photo.png',
      mime_type: 'image/png',
      size_bytes: 1024,
      path: '/storage/assets/photo.png',
      sha256: 'mock-hash-1',
    };
    const voiceUploadRes: AssetUploadResponse = {
      asset_id: 'voice-asset-456',
      kind: 'voice',
      filename: 'voice.wav',
      mime_type: 'audio/wav',
      size_bytes: 2048,
      path: '/storage/assets/voice.wav',
      sha256: 'mock-hash-2',
    };

    vi.spyOn(apiClient, 'uploadAsset')
      .mockResolvedValueOnce(photoUploadRes)
      .mockResolvedValueOnce(voiceUploadRes);

    const mockPhotoFile = { name: 'photo.png', type: 'image/png' } as unknown as File;
    const mockVoiceFile = { name: 'voice.wav', type: 'audio/wav' } as unknown as File;

    const photoRes = await apiClient.uploadAsset('photo', mockPhotoFile);
    const voiceRes = await apiClient.uploadAsset('voice', mockVoiceFile);
    expect(photoRes.asset_id).toBe('photo-asset-123');
    expect(voiceRes.asset_id).toBe('voice-asset-456');

    // 4. Submit Job Creation (POST /v1/jobs)
    const mockCreatedJobRecord: JobRecord = {
      job_id: 'job-happy-789',
      state: 'RECEIVED',
      status: 'RECEIVED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      target_duration_seconds: 30,
    };
    vi.spyOn(apiClient, 'createJob').mockResolvedValue(mockCreatedJobRecord);

    const createRes = await apiClient.createJob({
      photo_asset_id: photoRes.asset_id,
      voice_asset_id: voiceRes.asset_id,
      script: validScript,
      duration_preset: '30s',
      target_duration_seconds: 30,
      consent: {
        authorized: true,
        statement: 'I attest that I own or have permission to use this photo and voice sample, and authorize Memory Studio to render this video.',
        face_rights_attested: true,
        voice_rights_attested: true,
      },
    });
    expect(createRes.job_id).toBe('job-happy-789');

    // 5. Polling Lifecycle Progression: RECEIVED -> SYNTHESIZING_AUDIO -> ASSEMBLING -> COMPLETED
    const stateSequence = ['RECEIVED', 'SYNTHESIZING_AUDIO', 'ASSEMBLING', 'COMPLETED'] as const;
    stateSequence.forEach((state, pollIdx) => {
      const story = mapJobStateToStory(state);
      expect(story.title).toBeTruthy();
      expect(story.storyLine).toBeTruthy();

      const interval = getPollingInterval(pollIdx + 1);
      expect(interval).toBeGreaterThanOrEqual(3000);

      const terminal = isTerminalState(state);
      if (state === 'COMPLETED') {
        expect(terminal).toBe(true);
      } else {
        expect(terminal).toBe(false);
      }
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from './client';
import type { JobCreatePayload } from '../types/api';

describe('MemoryStudioAPIClient.createJob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs POST /v1/jobs request with correct JSON payload', async () => {
    const mockPayload: JobCreatePayload = {
      photo_asset_id: 'photo-asset-123',
      voice_asset_id: 'voice-asset-456',
      script: 'A peaceful sunny morning in a lush green valley.',
      prompt: 'Cinematic warm lighting',
      duration_preset: '30s',
      target_duration_seconds: 30,
      consent: {
        authorized: true,
        statement: 'I confirm I hold full rights to this media.',
        face_rights_attested: true,
        voice_rights_attested: true,
      },
    };

    const mockJobResponse = {
      job_id: 'job-789-abc',
      state: 'RECEIVED',
      status: 'RECEIVED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Mock global fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJobResponse,
    } as any);

    const result = await apiClient.createJob(mockPayload);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (globalThis.fetch as any).mock.calls[0];

    expect(url).toBe('/api/v1/jobs');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(mockPayload));
    expect(result.job_id).toBe('job-789-abc');
    expect(result.state).toBe('RECEIVED');
  });

  it('handles 422 Unprocessable Entity error gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: 'Script duration mismatch: script gives 12s but target is 30s' }),
    } as any);

    const mockPayload: JobCreatePayload = {
      photo_asset_id: 'photo-1',
      voice_asset_id: 'voice-1',
      script: 'Too short script',
      consent: {
        authorized: true,
        statement: 'Consent',
        face_rights_attested: true,
        voice_rights_attested: true,
      },
    };

    await expect(apiClient.createJob(mockPayload)).rejects.toThrow(
      'Script duration mismatch: script gives 12s but target is 30s'
    );
  });
});

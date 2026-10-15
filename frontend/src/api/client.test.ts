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

  it('fetches presets from GET /v1/presets', async () => {
    const mockPresets = {
      avatars: [{ id: 'avatar_default', name: 'Default Avatar', thumbnail_url: '/v1/presets/avatars/avatar_default/thumbnail' }],
      voices: [{ id: 'voice_piper_lessac', name: 'Piper Lessac' }],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPresets,
    } as any);

    const result = await apiClient.getPresets();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/presets', expect.objectContaining({ headers: expect.any(Object) }));
    expect(result.avatars).toHaveLength(1);
    expect(result.voices).toHaveLength(1);
  });

  it('generates script via POST /v1/scripts/generate', async () => {
    const mockScriptResp = {
      script: 'A lovely morning walk in the forest.',
      word_count: 7,
      estimated_seconds: 3.0,
      target_words: 7,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScriptResp,
    } as any);

    const result = await apiClient.generateScript({
      prompt: 'A walk in the forest',
      duration_preset: '30s',
      tone: 'friendly',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/scripts/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A walk in the forest',
          duration_preset: '30s',
          tone: 'friendly',
        }),
      })
    );
    expect(result.script).toBe('A lovely morning walk in the forest.');
  });

  it('queries GET /v1/capabilities with query parameters', async () => {
    const mockCaps = {
      gpu: { available: true, device_name: 'NVIDIA RTX 4090' },
      providers: { ollama: true, diffusers: true, whisper: true, piper: true, cards: true },
      auto_subtitles: true,
      image_provider_configured: 'diffusers',
      llm_provider_configured: 'ollama',
      estimate: {
        estimated_seconds: 18,
        display_text: '~18 seconds (GPU accelerated)',
        device: 'gpu',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCaps,
    } as any);

    const result = await apiClient.getCapabilities('slideshow', 30);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/capabilities?mode=slideshow&duration_seconds=30',
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result.gpu.available).toBe(true);
    expect(result.estimate?.estimated_seconds).toBe(18);
  });

  it('cancels job via POST /v1/jobs/{id}/cancel', async () => {
    const mockCancelledJob = {
      job_id: 'job-999',
      state: 'CANCELLED',
      status: 'CANCELLED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCancelledJob,
    } as any);

    const result = await apiClient.cancelJob('job-999');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/jobs/job-999/cancel',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.state).toBe('CANCELLED');
  });
});

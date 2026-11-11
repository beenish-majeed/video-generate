import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { PremiereStep, saveVideoWithPicker } from './PremiereStep';
import type { JobRecord } from '../../types/api';

const mockJob: JobRecord = {
  job_id: 'job_12345678abcdef',
  state: 'COMPLETED',
  status: 'COMPLETED',
  target_duration_seconds: 30,
  final_video_duration_seconds: 30.2,
  created_at: '2026-11-11T12:00:00Z',
  updated_at: '2026-11-11T12:01:00Z',
};

describe('PremiereStep result screen', () => {
  it('renders Grand Premiere with Download, Save, and Make another buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(PremiereStep, {
        job: mockJob,
        onRestart: () => {},
      })
    );

    expect(html).toContain('Grand Premiere');
    expect(html).toContain('Make another');
    expect(html).toContain('Save');
    expect(html).toContain('Download');
    expect(html).toContain('video');
  });

  it('saveVideoWithPicker falls back cleanly when window.showSaveFilePicker is absent', async () => {
    const fallbackFn = vi.fn().mockResolvedValue(undefined);
    await saveVideoWithPicker('https://example.com/video.mp4', 'video.mp4', fallbackFn);
    expect(fallbackFn).toHaveBeenCalledTimes(1);
  });
});

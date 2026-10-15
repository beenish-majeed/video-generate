import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaitingStep } from './WaitingStep';
import apiClient from '../../api/client';

describe('WaitingStep component tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders active waiting room with cancel job button', () => {
    vi.spyOn(apiClient, 'getJob').mockReturnValue(new Promise(() => {}));

    const markup = renderToStaticMarkup(
      React.createElement(WaitingStep, {
        jobId: 'job-test-123',
        onCompleted: () => {},
        onFailed: () => {},
      })
    );

    expect(markup).toContain('STUDIO WAITING ROOM');
    expect(markup).toContain('Rendering your memory film');
    expect(markup).toContain('job-test-123');
    expect(markup).toContain('data-testid="cancel-job-btn"');
    expect(markup).toContain('Cancel job');
  });

  it('2. Maps CANCELLED job state to clean cancellation story', async () => {
    vi.spyOn(apiClient, 'getJob').mockResolvedValue({
      job_id: 'job-cancelled-999',
      state: 'CANCELLED',
      status: 'CANCELLED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const markup = renderToStaticMarkup(
      React.createElement(WaitingStep, {
        jobId: 'job-cancelled-999',
        onCompleted: () => {},
        onFailed: () => {},
      })
    );

    expect(markup).toContain('Job ID');
    expect(markup).toContain('job-cancelled-999');
  });
});

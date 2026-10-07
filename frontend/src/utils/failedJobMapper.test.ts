import { describe, it, expect } from 'vitest';
import { mapFailedJobError } from './failedJobMapper';

describe('mapFailedJobError', () => {
  it('maps TTS speech audio duration outside 10% tolerance error', () => {
    const rawError = 'TTS speech audio duration (14.2s) is outside 10% tolerance of target duration (30.0s)';
    const result = mapFailedJobError(rawError);

    expect(result.title).toBe('Script & Duration Pacing Mismatch');
    expect(result.explanation).toContain('too short or too long');
    expect(result.nextStep).toContain('adjust your script word count');
    expect(result.recommendedStep).toBe('script');
  });

  it('maps interrupted by a server restart error', () => {
    const rawError = 'Job execution was interrupted by a server restart.';
    const result = mapFailedJobError(rawError);

    expect(result.title).toBe('Studio Server Restarted');
    expect(result.explanation).toContain('restarted while your video was being rendered');
    expect(result.nextStep).toContain('Try Again');
    expect(result.recommendedStep).toBe('consent');
  });

  it('provides generic fallback for unknown errors', () => {
    const rawError = 'Unexpected database locking exception in worker #4';
    const result = mapFailedJobError(rawError);

    expect(result.title).toBe('Studio Render Pause');
    expect(result.explanation).toContain('Unexpected database locking exception');
    expect(result.nextStep).toContain('Try Again');
  });

  it('provides safe fallback when error parameter is null or empty', () => {
    const result = mapFailedJobError(null);

    expect(result.title).toBe('Studio Render Pause');
    expect(result.explanation).toContain('unexpected hiccup');
    expect(result.nextStep).toContain('Try Again');
  });
});

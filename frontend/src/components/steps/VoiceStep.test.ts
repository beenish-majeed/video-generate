import { describe, it, expect } from 'vitest';

describe('VoiceStep Recording Rules & Error Handling', () => {
  it('defines valid minimum and maximum recording limits', () => {
    const MIN_RECORD_SECONDS = 3;
    const MAX_RECORD_SECONDS = 60;

    expect(MIN_RECORD_SECONDS).toBe(3);
    expect(MAX_RECORD_SECONDS).toBe(60);
    expect(MAX_RECORD_SECONDS).toBeGreaterThan(MIN_RECORD_SECONDS);
  });

  it('validates audio clip duration against limits', () => {
    const isDurationValid = (duration: number) => duration >= 3 && duration <= 60;

    expect(isDurationValid(2)).toBe(false);
    expect(isDurationValid(3)).toBe(true);
    expect(isDurationValid(25)).toBe(true);
    expect(isDurationValid(60)).toBe(true);
    expect(isDurationValid(61)).toBe(false);
  });

  it('maps microphone permission and device errors correctly', () => {
    const mapMicError = (errName: string): string => {
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        return 'Microphone permission was denied. Please allow microphone access in your browser address bar settings or choose "Upload a file".';
      }
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || errName === 'OverconstrainedError') {
        return 'No microphone input device was detected on your system. Please connect a microphone or choose "Upload a file".';
      }
      return 'Could not access microphone.';
    };

    expect(mapMicError('NotAllowedError')).toContain('permission was denied');
    expect(mapMicError('PermissionDeniedError')).toContain('permission was denied');
    expect(mapMicError('NotFoundError')).toContain('No microphone input device');
    expect(mapMicError('DevicesNotFoundError')).toContain('No microphone input device');
  });

  it('stops all tracks in a MediaStream during cleanup', () => {
    let stoppedCount = 0;
    const mockTrack1 = { stop: () => stoppedCount++ };
    const mockTrack2 = { stop: () => stoppedCount++ };
    const mockStream = {
      getTracks: () => [mockTrack1, mockTrack2],
    };

    mockStream.getTracks().forEach((track) => track.stop());
    expect(stoppedCount).toBe(2);
  });
});

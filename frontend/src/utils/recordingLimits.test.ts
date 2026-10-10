import { describe, it, expect } from 'vitest';
import {
  validateRecordingDuration,
  MIN_RECORD_SECONDS,
  MAX_RECORD_SECONDS,
} from './recordingLimits';

describe('Recording Length Limits Unit Tests', () => {
  it('1. Below minimum: returns "too_short" for durations under 3 seconds', () => {
    expect(validateRecordingDuration(0)).toBe('too_short');
    expect(validateRecordingDuration(1)).toBe('too_short');
    expect(validateRecordingDuration(2)).toBe('too_short');
    expect(validateRecordingDuration(2.9)).toBe('too_short');
  });

  it('2. At minimum: returns "valid" exactly at the 3-second boundary', () => {
    expect(validateRecordingDuration(MIN_RECORD_SECONDS)).toBe('valid');
    expect(validateRecordingDuration(3.0)).toBe('valid');
  });

  it('3. In range: returns "valid" for durations between 3s and 60s', () => {
    expect(validateRecordingDuration(4)).toBe('valid');
    expect(validateRecordingDuration(15)).toBe('valid');
    expect(validateRecordingDuration(30)).toBe('valid');
    expect(validateRecordingDuration(45)).toBe('valid');
    expect(validateRecordingDuration(59.9)).toBe('valid');
  });

  it('4. At maximum: returns "valid" exactly at the 60-second limit', () => {
    expect(validateRecordingDuration(MAX_RECORD_SECONDS)).toBe('valid');
    expect(validateRecordingDuration(60.0)).toBe('valid');
  });

  it('5. Above maximum: returns "too_long" for durations exceeding 60 seconds', () => {
    expect(validateRecordingDuration(60.1)).toBe('too_long');
    expect(validateRecordingDuration(61)).toBe('too_long');
    expect(validateRecordingDuration(120)).toBe('too_long');
  });
});

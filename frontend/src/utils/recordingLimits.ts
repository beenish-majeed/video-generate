export const MIN_RECORD_SECONDS = 3;
export const MAX_RECORD_SECONDS = 60;

export type DurationValidationResult = 'too_short' | 'valid' | 'too_long';

/**
 * Validates audio recording duration in seconds against studio min and max boundaries.
 */
export function validateRecordingDuration(seconds: number): DurationValidationResult {
  if (seconds < MIN_RECORD_SECONDS) return 'too_short';
  if (seconds > MAX_RECORD_SECONDS) return 'too_long';
  return 'valid';
}

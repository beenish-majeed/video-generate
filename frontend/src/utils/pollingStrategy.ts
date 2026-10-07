/**
 * Pure polling strategy utilities.
 */

export const INITIAL_POLL_INTERVAL_MS = 3000;
export const BACKOFF_POLL_INTERVAL_MS = 10000;
export const FAST_POLL_LIMIT = 5;

/**
 * Returns polling interval in milliseconds based on poll attempt count.
 * Starts at 3000ms for first 5 polls, then backs off to 10000ms.
 */
export function getPollingInterval(pollCount: number): number {
  if (pollCount < FAST_POLL_LIMIT) {
    return INITIAL_POLL_INTERVAL_MS;
  }
  return BACKOFF_POLL_INTERVAL_MS;
}

/**
 * Checks if a given job state is terminal (COMPLETED or FAILED).
 */
export function isTerminalState(state: string): boolean {
  const upper = (state || '').toUpperCase();
  return upper === 'COMPLETED' || upper === 'FAILED';
}

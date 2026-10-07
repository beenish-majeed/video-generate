import { describe, it, expect } from 'vitest';
import { mapJobStateToStory, ALL_JOB_STATES } from './jobStateMapper';
import { getPollingInterval, isTerminalState, INITIAL_POLL_INTERVAL_MS, BACKOFF_POLL_INTERVAL_MS } from './pollingStrategy';

describe('mapJobStateToStory', () => {
  it('covers EVERY real job state defined in backend schema', () => {
    ALL_JOB_STATES.forEach((state) => {
      const mapped = mapJobStateToStory(state);
      expect(mapped).toBeDefined();
      expect(typeof mapped.title).toBe('string');
      expect(mapped.title.length).toBeGreaterThan(0);
      expect(typeof mapped.storyLine).toBe('string');
      expect(mapped.storyLine.length).toBeGreaterThan(0);
      expect(typeof mapped.doodleKind).toBe('string');
      expect(typeof mapped.progressPercent).toBe('number');
    });
  });

  it('provides safe fallback for unknown states', () => {
    const unknownState = 'SOME_FUTURE_CUSTOM_STATE';
    const mapped = mapJobStateToStory(unknownState);
    expect(mapped.title).toBe('Crafting Memory');
    expect(mapped.storyLine).toBe('Crafting your memory film in the studio...');
    expect(mapped.doodleKind).toBe('sparkle');
    expect(mapped.progressPercent).toBe(50);
  });

  it('correctly maps specific key states to story lines', () => {
    expect(mapJobStateToStory('SYNTHESIZING_AUDIO').storyLine).toContain('Your voice is being listened to');
    expect(mapJobStateToStory('PREPARING_IDENTITY').storyLine).toContain('Teaching your portrait to speak');
    expect(mapJobStateToStory('GENERATING_SEGMENTS').storyLine).toContain('Stitching the scenes together');
    expect(mapJobStateToStory('QA_CHECKING').storyLine).toContain('Final touches');
    expect(mapJobStateToStory('ASSEMBLING').storyLine).toContain('Final touches');
  });
});

describe('pollingStrategy', () => {
  it('returns initial 3000ms interval for early polls (<5)', () => {
    expect(getPollingInterval(0)).toBe(INITIAL_POLL_INTERVAL_MS); // 3000
    expect(getPollingInterval(2)).toBe(INITIAL_POLL_INTERVAL_MS); // 3000
    expect(getPollingInterval(4)).toBe(INITIAL_POLL_INTERVAL_MS); // 3000
  });

  it('backs off to 10000ms interval for later polls (>=5)', () => {
    expect(getPollingInterval(5)).toBe(BACKOFF_POLL_INTERVAL_MS); // 10000
    expect(getPollingInterval(6)).toBe(BACKOFF_POLL_INTERVAL_MS); // 10000
    expect(getPollingInterval(20)).toBe(BACKOFF_POLL_INTERVAL_MS); // 10000
  });

  it('identifies terminal states COMPLETED and FAILED', () => {
    expect(isTerminalState('COMPLETED')).toBe(true);
    expect(isTerminalState('FAILED')).toBe(true);
    expect(isTerminalState('SYNTHESIZING_AUDIO')).toBe(false);
    expect(isTerminalState('GENERATING_SEGMENTS')).toBe(false);
  });
});

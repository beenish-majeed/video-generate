import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  DurationStep,
  RENDER_SECONDS_PER_VIDEO_SECOND,
  formatRenderEstimate,
  DURATION_ROW_1,
  DURATION_ROW_2,
} from './DurationStep';

describe('DurationStep compact two-row layout and honest render estimates', () => {
  it('uses RENDER_SECONDS_PER_VIDEO_SECOND ratio of 3.7', () => {
    expect(RENDER_SECONDS_PER_VIDEO_SECOND).toBe(3.7);
  });

  it('formats render estimate correctly for seconds and minutes', () => {
    // 5s * 3.7 = 18.5 -> 19s
    expect(formatRenderEstimate(5)).toBe('~19 sec');
    // 30s * 3.7 = 111s -> 1.85 min -> ~1.9 min
    expect(formatRenderEstimate(30)).toBe('~1.9 min');
    // 60s * 3.7 = 222s -> 3.7 min
    expect(formatRenderEstimate(60)).toBe('~3.7 min');
    // 120s * 3.7 = 444s -> 7.4 min
    expect(formatRenderEstimate(120)).toBe('~7.4 min');
    // 600s * 3.7 = 2220s -> 37 min
    expect(formatRenderEstimate(600)).toBe('~37 min');
  });

  it('defines 3 cards in Row 1 and 4 cards in Row 2', () => {
    expect(DURATION_ROW_1.map((c) => c.label)).toEqual(['5 sec', '30 sec', '1 min']);
    expect(DURATION_ROW_2.map((c) => c.label)).toEqual(['2 min', '3 min', '5 min', '10 min']);
  });

  it('renders heading only and exactly two buttons (Back and Continue)', () => {
    const html = renderToStaticMarkup(
      React.createElement(DurationStep, {
        selectedPreset: '30s',
        onPresetSelected: () => {},
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Heading only
    expect(html).toContain('Select video duration');
    expect(html).not.toContain('How long should your animated film be?');
    expect(html).not.toContain('Estimated Studio Render Time');

    // Only two buttons
    expect(html).toContain('Back');
    expect(html).toContain('Continue');
    expect(html).not.toContain('Continue to Script');

    // All presets rendered
    expect(html).toContain('5 sec');
    expect(html).toContain('30 sec');
    expect(html).toContain('1 min');
    expect(html).toContain('2 min');
    expect(html).toContain('3 min');
    expect(html).toContain('5 min');
    expect(html).toContain('10 min');

    // Honest render estimates
    expect(html).toContain('~19 sec');
  });

  it('renders detected audio duration when provided in Flow B', () => {
    const html = renderToStaticMarkup(
      React.createElement(DurationStep, {
        selectedPreset: '30s',
        onPresetSelected: () => {},
        onNext: () => {},
        onBack: () => {},
        detectedAudioSeconds: 42,
      })
    );

    expect(html).toContain('Select video duration');
    expect(html).toContain('42 sec');
    expect(html).toContain('Detected from your voice audio');
    // Preset cards should not be rendered
    expect(html).not.toContain('duration-row-1');
  });
});

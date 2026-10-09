import { describe, it, expect } from 'vitest';
import { CUSTOM_MEDIA_STEPS, PROMPT_FIRST_STEPS } from './PageTabs';

describe('PageTabs Step Configuration', () => {
  it('defines 8 steps for custom media flow', () => {
    expect(CUSTOM_MEDIA_STEPS).toHaveLength(8);
    expect(CUSTOM_MEDIA_STEPS.map((s) => s.id)).toEqual([
      'hero',
      'photo',
      'voice',
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);
  });

  it('defines 6 steps for prompt first flow (skipping photo & voice steps)', () => {
    expect(PROMPT_FIRST_STEPS).toHaveLength(6);
    expect(PROMPT_FIRST_STEPS.map((s) => s.id)).toEqual([
      'hero',
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);
  });

  it('maintains proper numbered tab titles for prompt first flow', () => {
    expect(PROMPT_FIRST_STEPS[0].tabTitle).toBe('00. Intro');
    expect(PROMPT_FIRST_STEPS[1].tabTitle).toBe('01. Pace & Time');
    expect(PROMPT_FIRST_STEPS[2].tabTitle).toBe('02. Narrative');
    expect(PROMPT_FIRST_STEPS[3].tabTitle).toBe('03. Rights & Consent');
  });
});

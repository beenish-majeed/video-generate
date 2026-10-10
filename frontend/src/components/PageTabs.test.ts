import { describe, it, expect } from 'vitest';
import {
  CUSTOM_MEDIA_STEPS,
  PROMPT_FIRST_STEPS,
  getStepListForMode,
} from './PageTabs';

describe('Path-Based Step List Unit Tests', () => {
  it('1. Upload path (custom_media): returns 8 steps in exact order', () => {
    const steps = getStepListForMode('custom_media');
    expect(steps).toHaveLength(8);
    expect(steps.map((s) => s.id)).toEqual([
      'hero',
      'photo',
      'voice',
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);

    expect(steps.map((s) => s.tabTitle)).toEqual([
      '00. Intro',
      '01. Memory Photo',
      '02. Voice Sample',
      '03. Pace & Time',
      '04. Narrative',
      '05. Rights & Consent',
      '06. Studio Render',
      '07. Final Film',
    ]);
  });

  it('2. Prompt path (prompt_first): returns 6 steps in exact order (skipping photo & voice)', () => {
    const steps = getStepListForMode('prompt_first');
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.id)).toEqual([
      'hero',
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);

    expect(steps.map((s) => s.tabTitle)).toEqual([
      '00. Intro',
      '01. Pace & Time',
      '02. Narrative',
      '03. Rights & Consent',
      '04. Studio Render',
      '05. Final Film',
    ]);
  });

  it('3. Photo and Voice steps exist ONLY in custom_media path', () => {
    const customMediaIds = getStepListForMode('custom_media').map((s) => s.id);
    const promptFirstIds = getStepListForMode('prompt_first').map((s) => s.id);

    expect(customMediaIds).toContain('photo');
    expect(customMediaIds).toContain('voice');

    expect(promptFirstIds).not.toContain('photo');
    expect(promptFirstIds).not.toContain('voice');
  });

  it('4. Default flowMode falls back to custom_media step list', () => {
    const steps = getStepListForMode();
    expect(steps).toEqual(CUSTOM_MEDIA_STEPS);
  });
});

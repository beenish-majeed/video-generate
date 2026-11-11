import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  PageTabs,
  ENABLE_EXTENDED_WORKFLOWS,
  STREAMLINED_PROMPT_STEPS,
  STREAMLINED_PICTURE_STEPS,
  STREAMLINED_PICTURE_STEPS_OWN_VOICE,
  CUSTOM_MEDIA_STEPS,
  PROMPT_FIRST_STEPS,
  IMAGES_AUDIO_STEPS,
  getStepListForMode,
} from './PageTabs';

describe('PageTabs and Streamlined Flows Unit Tests', () => {
  it('1. Default ENABLE_EXTENDED_WORKFLOWS is false', () => {
    expect(ENABLE_EXTENDED_WORKFLOWS).toBe(false);
  });

  it('2. Flow A (prompt_first): returns streamlined 4 steps (Prompt, Duration, Creating, Premiere)', () => {
    const steps = getStepListForMode('prompt_first');
    expect(steps).toEqual(STREAMLINED_PROMPT_STEPS);
    expect(steps.map((s) => s.id)).toEqual(['idea', 'duration', 'waiting', 'premiere']);
    expect(steps.map((s) => s.label)).toEqual(['Prompt', 'Duration', 'Creating', 'Premiere']);
  });

  it('3. Flow B (custom_media with default voice): returns 7 steps including prompt step', () => {
    const steps = getStepListForMode('custom_media', false);
    expect(steps).toEqual(STREAMLINED_PICTURE_STEPS);
    expect(steps.map((s) => s.id)).toEqual([
      'photo',
      'voice',
      'duration',
      'idea',
      'consent',
      'waiting',
      'premiere',
    ]);
  });

  it('4. Flow B (custom_media with own voice): skips prompt step and returns 6 steps', () => {
    const steps = getStepListForMode('custom_media', true);
    expect(steps).toEqual(STREAMLINED_PICTURE_STEPS_OWN_VOICE);
    expect(steps.map((s) => s.id)).toEqual([
      'photo',
      'voice',
      'duration',
      'consent',
      'waiting',
      'premiere',
    ]);
    expect(steps.map((s) => s.id)).not.toContain('idea');
  });

  it('5. Legacy / extended workflows preserved intact when enableExtended is true', () => {
    expect(getStepListForMode('prompt_first', false, true)).toEqual(PROMPT_FIRST_STEPS);
    expect(getStepListForMode('custom_media', false, true)).toEqual(CUSTOM_MEDIA_STEPS);
    expect(getStepListForMode('images_audio', false, true)).toEqual(IMAGES_AUDIO_STEPS);
  });

  it('6. PageTabs returns null on hero and choice screens', () => {
    const heroMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'hero' })
    );
    expect(heroMarkup).toBe('');

    const choiceMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'choice' })
    );
    expect(choiceMarkup).toBe('');
  });

  it('7. PageTabs renders navigation tabs on workflow steps', () => {
    const photoMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'photo', flowMode: 'custom_media' })
    );
    expect(photoMarkup).toContain('Picture');
    expect(photoMarkup).toContain('role="tablist"');
  });
});

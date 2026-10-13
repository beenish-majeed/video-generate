import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  PageTabs,
  CUSTOM_MEDIA_STEPS,
  PROMPT_FIRST_STEPS,
  getStepListForMode,
} from './PageTabs';

describe('Path-Based Step List Unit Tests', () => {
  it('1. Upload path (custom_media): returns 7 steps in exact order (excluding welcome and choice)', () => {
    const steps = getStepListForMode('custom_media');
    expect(steps).toHaveLength(7);
    expect(steps.map((s) => s.id)).toEqual([
      'photo',
      'voice',
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);

    expect(steps.map((s) => s.tabTitle)).toEqual([
      '01. Memory Photo',
      '02. Voice Sample',
      '03. Pace & Time',
      '04. Narrative',
      '05. Rights & Consent',
      '06. Studio Render',
      '07. Final Film',
    ]);
  });

  it('2. Prompt path (prompt_first): returns 5 steps in exact order (skipping photo & voice)', () => {
    const steps = getStepListForMode('prompt_first');
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.id)).toEqual([
      'duration',
      'script',
      'consent',
      'waiting',
      'premiere',
    ]);

    expect(steps.map((s) => s.tabTitle)).toEqual([
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
    expect(getStepListForMode('prompt_first')).toEqual(PROMPT_FIRST_STEPS);
  });

  it('5. PageTabs returns null (hidden tabs) on welcome (hero) and choice screens', () => {
    const heroMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'hero' })
    );
    expect(heroMarkup).toBe('');

    const choiceMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'choice' })
    );
    expect(choiceMarkup).toBe('');
  });

  it('6. PageTabs renders navigation tabs on workflow steps', () => {
    const photoMarkup = renderToStaticMarkup(
      React.createElement(PageTabs, { currentStep: 'photo', flowMode: 'custom_media' })
    );
    expect(photoMarkup).toContain('01. Memory Photo');
    expect(photoMarkup).toContain('role="tablist"');
  });
});


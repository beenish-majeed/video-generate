import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { StoryTimeline } from './StoryTimeline';

describe('StoryTimeline Unit Tests', () => {
  it('1. Renders story progress rail navigation container with accessible role', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, { currentStep: 'hero' })
    );
    expect(markup).toContain('story-timeline-rail');
    expect(markup).toContain('role="navigation"');
    expect(markup).toContain('aria-label="Story Progress Timeline"');
  });

  it('2. In intro steps (hero/choice), displays prologue story steps', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, { currentStep: 'hero' })
    );
    expect(markup).toContain('Prologue');
    expect(markup).toContain('Direction');
    expect(markup).toContain('Premiere');
  });

  it('3. In prompt_first flow, displays custom step list', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, {
        currentStep: 'idea',
        flowMode: 'prompt_first',
      })
    );
    expect(markup).toContain('Prompt');
    expect(markup).toContain('Duration');
    expect(markup).toContain('Studio Render');
    expect(markup).toContain('Premiere');
  });

  it('4. Highlights the active step with aria-current="step"', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, {
        currentStep: 'idea',
        flowMode: 'prompt_first',
      })
    );
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('(current step)');
  });

  it('5. Marks completed steps as completed in accessible label', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, {
        currentStep: 'duration',
        flowMode: 'prompt_first',
      })
    );
    expect(markup).toContain('(completed)');
  });

  it('6. Renders with horizontal-timeline class and flex row container', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoryTimeline, { currentStep: 'idea', flowMode: 'prompt_first' })
    );
    expect(markup).toContain('horizontal-timeline');
    expect(markup).toContain('story-timeline-container');
  });
});

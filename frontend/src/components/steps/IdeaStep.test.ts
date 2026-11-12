import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { IdeaStep, EXAMPLE_CHIPS, TONE_OPTIONS } from './IdeaStep';

describe('IdeaStep prompt screen tests', () => {
  it('1. Renders label "Your prompt" by default, 4 example chips, and 4 tone chips in tidy rows', () => {
    const markup = renderToStaticMarkup(
      React.createElement(IdeaStep, {
        initialIdea: 'A story about a garden',
        initialTone: 'storytelling',
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Default label
    expect(markup).toContain('Your prompt');
    // No extra helper headings
    expect(markup).not.toContain('What is your video about?');
    expect(markup).not.toContain('Write a thought, a memory, or an idea.');

    // 4 example chips
    expect(EXAMPLE_CHIPS.length).toBe(4);
    expect(markup).toContain('Autumn Walk');
    expect(markup).toContain('Community Thanks');
    expect(markup).toContain('Studio Journey');
    expect(markup).toContain('Starlit Tale');

    // Tone selection heading
    expect(markup).toContain('Select your tone');

    // 4 tone chips
    expect(TONE_OPTIONS.length).toBe(4);
    expect(markup).toContain('Friendly');
    expect(markup).toContain('Professional');
    expect(markup).toContain('Storytelling');
    expect(markup).toContain('Educational');

    // Only two buttons: Back and Continue
    expect(markup).toContain('Back');
    expect(markup).toContain('Continue');
  });

  it('2. Supports custom label "Prompt" for Flow B', () => {
    const markup = renderToStaticMarkup(
      React.createElement(IdeaStep, {
        label: 'Prompt',
        initialIdea: 'Flow B prompt text',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Prompt');
    expect(markup).not.toContain('Your prompt');
  });

  it('3. Disables Continue button when prompt is empty', () => {
    const markup = renderToStaticMarkup(
      React.createElement(IdeaStep, {
        initialIdea: '',
        initialTone: 'friendly',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('disabled');
  });
});

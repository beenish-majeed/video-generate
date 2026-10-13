import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { IdeaStep } from './IdeaStep';

describe('IdeaStep component tests', () => {
  it('1. Renders prompt textarea, counter, 4 example chips, and tone selector', () => {
    const markup = renderToStaticMarkup(
      React.createElement(IdeaStep, {
        initialIdea: 'A story about a garden',
        initialTone: 'storytelling',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('What is your video about?');
    expect(markup).toContain('Your Idea Prompt');
    expect(markup).toContain('/ 1000 characters');
    expect(markup).toContain('Narrator Tone');
    expect(markup).toContain('Autumn Walk');
    expect(markup).toContain('Community Thanks');
    expect(markup).toContain('Studio Journey');
    expect(markup).toContain('Starlit Tale');
    expect(markup).toContain('Friendly');
    expect(markup).toContain('Professional');
    expect(markup).toContain('Storytelling');
    expect(markup).toContain('Educational');
  });

  it('2. Disables Next button when initial idea is empty', () => {
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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { HeroStep } from './HeroStep';

describe('HeroStep welcome page', () => {
  it('renders headline and single "Get started" button without choice cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroStep, {
        onGetStarted: () => {},
      })
    );

    // Warm headline and one line explanation
    expect(html).toContain('Turn your ideas into a quiet, living video memory.');
    expect(html).toContain('Craft an intimate animated memory with gentle sound.');

    // Single "Get started" button
    expect(html).toContain('Get started');

    // Choice cards must NOT be on this welcome page
    expect(html).not.toContain('Upload your photo or voice');
    expect(html).not.toContain('Write a prompt and make a video');
    expect(html).not.toContain('welcome-prompt-input');
    expect(html).not.toContain('Upload Photo &amp; Voice');
    expect(html).not.toContain('Start with Prompt');
  });
});

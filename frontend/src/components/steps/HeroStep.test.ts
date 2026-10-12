import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { HeroStep, ENABLE_PROMPT_PATH } from './HeroStep';

describe('HeroStep welcome page option gating', () => {
  it('has ENABLE_PROMPT_PATH configured as false', () => {
    expect(ENABLE_PROMPT_PATH).toBe(false);
  });

  it('shows only the upload option when ENABLE_PROMPT_PATH is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroStep, {
        prompt: '',
        onPromptChange: () => {},
        onSelectPromptFlow: () => {},
        onSelectCustomMediaFlow: () => {},
      })
    );

    // The upload option must be rendered
    expect(html).toContain('Upload your photo or voice');
    expect(html).toContain('Upload Photo &amp; Voice');

    // The prompt-first card elements must NOT be rendered
    expect(html).not.toContain('Write a prompt and make a video');
    expect(html).not.toContain('Start with Prompt');
    expect(html).not.toContain('welcome-prompt-input');
  });
});

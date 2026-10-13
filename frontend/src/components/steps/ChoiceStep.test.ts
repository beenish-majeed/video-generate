import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChoiceStep, ENABLE_PROMPT_PATH } from './ChoiceStep';

describe('ChoiceStep screen and prompt path gating', () => {
  it('has ENABLE_PROMPT_PATH configured as true', () => {
    expect(ENABLE_PROMPT_PATH).toBe(true);
  });

  it('renders both path cards on the choice screen', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    // Screen heading
    expect(html).toContain('How would you like to begin?');

    // Both cards must be present
    expect(html).toContain('Start with a prompt');
    expect(html).toContain('Use my own photo and voice');

    // Back button to welcome page
    expect(html).toContain('Back');
  });

  it('renders prompt card as enabled and active without Coming soon state when ENABLE_PROMPT_PATH is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    // Prompt card active state
    expect(html).toContain('QUICK PROMPT');
    expect(html).toContain('Start with Prompt');
    expect(html).not.toContain('aria-disabled="true"');

    // Coming soon elements must NOT be present
    expect(html).not.toContain('COMING SOON');
    expect(html).not.toContain('Default studio assets are not yet available');
    expect(html).not.toContain('Coming soon (needs default assets)');

    // Custom media upload card action button must also be present
    expect(html).toContain('Use my photo &amp; voice');
  });
});

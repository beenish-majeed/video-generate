import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChoiceStep, ENABLE_PROMPT_PATH } from './ChoiceStep';

describe('ChoiceStep screen and prompt path gating', () => {
  it('has ENABLE_PROMPT_PATH configured as false', () => {
    expect(ENABLE_PROMPT_PATH).toBe(false);
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

  it('renders prompt card as disabled with Coming soon sticker and note when ENABLE_PROMPT_PATH is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    // Prompt card gating
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('COMING SOON');
    expect(html).toContain('Default studio assets are not yet available');
    expect(html).toContain('Coming soon (needs default assets)');

    // Active button for prompt flow must NOT be rendered as a button action
    expect(html).not.toContain('<button type="button" class="btn-terracotta"');
    expect(html).not.toContain('Start with Prompt');

    // Upload card action button MUST be rendered and active
    expect(html).toContain('Use my photo &amp; voice');
  });
});

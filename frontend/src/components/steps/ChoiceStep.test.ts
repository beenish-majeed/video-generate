import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChoiceStep, ENABLE_PROMPT_PATH, SHOW_EXTENDED_MODES } from './ChoiceStep';

describe('ChoiceStep screen with two creative paths', () => {
  it('has ENABLE_PROMPT_PATH configured as true', () => {
    expect(ENABLE_PROMPT_PATH).toBe(true);
  });

  it('has SHOW_EXTENDED_MODES configured as false by default', () => {
    expect(SHOW_EXTENDED_MODES).toBe(false);
  });

  it('renders exactly two primary cards: Text to video and Picture to video', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectImagesAudioFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    // Screen heading & label
    expect(html).toContain('Creation Mode');
    expect(html).toContain('Choose how to create your video');

    // Exactly two primary cards
    expect(html).toContain('Text to video');
    expect(html).toContain('Picture to video');

    // Extended options hidden behind configuration flag
    expect(html).not.toContain('A talking face');
    expect(html).not.toContain('AI scene clips');

    // Back button to welcome page
    expect(html).toContain('Back');
  });

  it('renders choice cards cleanly without capabilities panel', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectImagesAudioFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    expect(html).not.toContain('Your computer');
    expect(html).not.toContain('Limitations:');
  });
});

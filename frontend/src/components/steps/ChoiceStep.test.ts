import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChoiceStep, ENABLE_PROMPT_PATH } from './ChoiceStep';

describe('ChoiceStep screen with three creative paths', () => {
  it('has ENABLE_PROMPT_PATH configured as true', () => {
    expect(ENABLE_PROMPT_PATH).toBe(true);
  });

  it('renders all three path cards on the choice screen', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectImagesAudioFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    // Screen heading
    expect(html).toContain('How would you like to begin?');

    // All three cards must be present
    expect(html).toContain('Write an idea');
    expect(html).toContain('Use my photos and voice');
    expect(html).toContain('A talking face');

    // Back button to welcome page
    expect(html).toContain('Back');
  });

  it('renders Your computer panel and limitations note on choice screen', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChoiceStep, {
        onSelectPromptFlow: () => {},
        onSelectImagesAudioFlow: () => {},
        onSelectCustomMediaFlow: () => {},
        onBack: () => {},
      })
    );

    expect(html).toContain('Your computer');
    expect(html).toContain('Limitations:');
    expect(html).toContain('visuals are generated scenes with camera moves, not real motion video');
  });
});

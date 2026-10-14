import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptStep } from './ScriptStep';
import apiClient from '../../api/client';

describe('ScriptStep component tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders calm story-style loading state on prompt path without fake percentage', () => {
    // Mock generateScript to return a pending promise during test render
    vi.spyOn(apiClient, 'generateScript').mockReturnValue(new Promise(() => {}));

    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: '',
        onScriptChange: () => {},
        prompt: 'A gentle morning walk through pine trees',
        onPromptChange: () => {},
        targetSeconds: 30,
        ideaText: 'A gentle morning walk through pine trees',
        isPromptPath: true,
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Calm story-style loading copy
    expect(markup).toContain('DRAFTING YOUR STORY');
    expect(markup).toContain('Listening to your idea...');
    expect(markup).toContain('A gentle morning walk through pine trees');
    expect(markup).toContain('Take a quiet breath while our storyteller writes');

    // Must NEVER show a fake percentage or progress counter in the loading state
    expect(markup).not.toMatch(/\b\d+%\b/);
    expect(markup).not.toContain('fake-progress');
    expect(markup).not.toContain('Progress');
  });

  it('2. Renders success state with editable textarea, live counter, and "Write it again" button', () => {
    // 30 seconds @ 150 WPM = 75 target words (range 68 - 83)
    const validScript = Array.from({ length: 75 }, (_, i) => `word${i}`).join(' ');

    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: validScript,
        onScriptChange: () => {},
        prompt: 'Morning walk',
        onPromptChange: () => {},
        targetSeconds: 30,
        wordsPerMinute: 150,
        isPromptPath: true,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Narrative Script');
    expect(markup).toContain('Write it again');
    expect(markup).toContain('id="narrative-script-input"');
    expect(markup).toContain('75 words');
    expect(markup).toContain('Continue to Rights');
    // Button must be enabled when within 90%-110%
    expect(markup).not.toContain('disabled=""');
  });

  it('3. Renders clear out-of-range helper message and disables continue when script is too short after editing', () => {
    // 10 words is far below the minimum (68 words for 30s)
    const shortScript = 'This is much too short for thirty seconds of film.';

    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: shortScript,
        onScriptChange: () => {},
        prompt: 'Short note',
        onPromptChange: () => {},
        targetSeconds: 30,
        wordsPerMinute: 150,
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Clear helper message for under-length script
    expect(markup).toContain('under the minimum');
    expect(markup).toContain('Please add more detail');
    // Continue to Rights button must be disabled
    expect(markup).toContain('disabled=""');
  });

  it('4. Renders clear out-of-range helper message and disables continue when script is too long after editing', () => {
    // 150 words exceeds the maximum (83 words for 30s)
    const longScript = Array.from({ length: 150 }, (_, i) => `longword${i}`).join(' ');

    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: longScript,
        onScriptChange: () => {},
        prompt: 'Long story',
        onPromptChange: () => {},
        targetSeconds: 30,
        wordsPerMinute: 150,
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Clear helper message for over-length script
    expect(markup).toContain('exceeds the maximum');
    expect(markup).toContain('Please shorten your script');
    // Continue to Rights button must be disabled
    expect(markup).toContain('disabled=""');
  });

  it('5. Renders error card with retry button when script generation fails', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: '',
        onScriptChange: () => {},
        prompt: 'Morning story',
        onPromptChange: () => {},
        targetSeconds: 30,
        isPromptPath: true,
        initialError: 'LLM provider timeout: please try again in a moment.',
        onNext: () => {},
        onBack: () => {},
      })
    );

    // Error state card
    expect(markup).toContain("Couldn&#x27;t draft your script right now");
    expect(markup).toContain('LLM provider timeout');
    expect(markup).toContain('Try Again');
    expect(markup).toContain('Write manually');
    expect(markup).toContain('Back');
  });

  it('6. Does not show "Write it again" button on custom media path', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: 'A lovely sunny afternoon in the high hills.',
        onScriptChange: () => {},
        prompt: '',
        onPromptChange: () => {},
        targetSeconds: 30,
        isPromptPath: false,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).not.toContain('Write it again');
  });

  it('7. Displays honest notice when basic template script is used', () => {
    const validScript = Array.from({ length: 74 }, (_, i) => `word${i}`).join(' ');

    const markup = renderToStaticMarkup(
      React.createElement(ScriptStep, {
        script: validScript,
        onScriptChange: () => {},
        prompt: 'Morning stroll',
        onPromptChange: () => {},
        targetSeconds: 30,
        wordsPerMinute: 148,
        isPromptPath: true,
        initialScriptSource: 'template',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain(
      'Basic script (no AI model installed). Edit it freely, or install Ollama for better scripts.'
    );
    expect(markup).toContain('data-testid="template-script-notice"');
  });
});

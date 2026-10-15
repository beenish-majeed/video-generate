import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LookVoiceStep } from './LookVoiceStep';
import apiClient from '../../api/client';

describe('LookVoiceStep component tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders Presentation style, Art & Visual Style, and Narrator Voice for slideshow mode', () => {
    vi.spyOn(apiClient, 'getPresets').mockResolvedValue({
      avatars: [
        { id: 'avatar_1', name: 'Storyteller Alex', thumbnail_url: '/v1/presets/avatars/avatar_1/thumbnail' },
      ],
      voices: [
        { id: 'voice_1', name: 'Lessac Warm' },
      ],
    });

    const markup = renderToStaticMarkup(
      React.createElement(LookVoiceStep, {
        initialVisualMode: 'slideshow',
        initialImageStyle: 'cinematic',
        initialAvatarId: 'avatar_1',
        initialVoiceId: 'voice_1',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Choose your look and voice');
    expect(markup).toContain('Presentation style');
    expect(markup).toContain('Visual style: scenes with camera moves');
    expect(markup).toContain('A talking face');
    expect(markup).toContain('Art &amp; Visual Style');
    expect(markup).toContain('Cinematic');
    expect(markup).toContain('Watercolor');
    expect(markup).toContain('Narrator Voice');
    expect(markup).toContain('Review Script');
    expect(markup).toContain('Limitations:');
  });

  it('2. Renders Character Look polaroids when presentation style is talking face', () => {
    vi.spyOn(apiClient, 'getPresets').mockResolvedValue({
      avatars: [
        { id: 'avatar_1', name: 'Storyteller Alex', thumbnail_url: '/v1/presets/avatars/avatar_1/thumbnail' },
      ],
      voices: [
        { id: 'voice_1', name: 'Lessac Warm' },
      ],
    });

    const markup = renderToStaticMarkup(
      React.createElement(LookVoiceStep, {
        initialVisualMode: 'talking_head',
        initialAvatarId: 'avatar_1',
        initialVoiceId: 'voice_1',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Character Look');
    expect(markup).toContain('Storyteller Portrait');
    expect(markup).toContain('Narrator Voice');
  });

  it('3. Does not render audio preview controls when sample_url is absent', () => {
    vi.spyOn(apiClient, 'getPresets').mockResolvedValue({
      avatars: [],
      voices: [{ id: 'voice_no_audio', name: 'Silent Preset' }],
    });

    const markup = renderToStaticMarkup(
      React.createElement(LookVoiceStep, {
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).not.toContain('<audio src');
  });
});

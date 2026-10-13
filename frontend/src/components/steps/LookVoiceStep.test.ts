import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LookVoiceStep } from './LookVoiceStep';
import apiClient from '../../api/client';

describe('LookVoiceStep component tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders Character Look polaroids and Narrator Voice sections', () => {
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
        initialAvatarId: 'avatar_1',
        initialVoiceId: 'voice_1',
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Choose your look and voice');
    expect(markup).toContain('Character Look');
    expect(markup).toContain('Narrator Voice');
    expect(markup).toContain('Review Script');
  });

  it('2. Does not render audio preview controls when sample_url is absent', () => {
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

    // Audio tag should not be rendered without sample_url
    expect(markup).not.toContain('<audio src');
  });
});

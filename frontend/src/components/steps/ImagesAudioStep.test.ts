import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImagesAudioStep, type UploadedImageItem } from './ImagesAudioStep';

describe('ImagesAudioStep component tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders photo sequence, voice options, subtitles toggle, and capabilities panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ImagesAudioStep, {
        initialImages: [],
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Photos, Voice &amp; Music');
    expect(markup).toContain('1. Your Photos (0/30)');
    expect(markup).toContain('2. Voice or Narration');
    expect(markup).toContain('3. Video Presentation Options');
    expect(markup).toContain('Burn in subtitles');
    expect(markup).toContain('Your computer');
    expect(markup).toContain('Limitations:');
    expect(markup).toContain('Continue to Consent');
  });

  it('2. Disables lip sync toggle when no face is detected and explains why', () => {
    const images: UploadedImageItem[] = [
      {
        id: 'img-1',
        assetId: 'img-1',
        previewUrl: 'http://localhost/test1.png',
        fileName: 'nature.png',
        duration: 3.5,
        facesDetected: 0,
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(ImagesAudioStep, {
        initialImages: images,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Ken Burns slideshow mode will be used (no face detected in your photos).');
    expect(markup).toContain('disabled=""');
  });

  it('3. Enables lip sync toggle when exactly one face is detected', () => {
    const images: UploadedImageItem[] = [
      {
        id: 'img-1',
        assetId: 'img-1',
        previewUrl: 'http://localhost/test1.png',
        fileName: 'portrait.png',
        duration: 3.5,
        facesDetected: 1,
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(ImagesAudioStep, {
        initialImages: images,
        initialPreferLipSync: true,
        onNext: () => {},
        onBack: () => {},
      })
    );

    expect(markup).toContain('Exactly 1 face detected! Lip sync is enabled for your portrait.');
  });
});

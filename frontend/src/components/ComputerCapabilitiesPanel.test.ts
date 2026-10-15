import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { ComputerCapabilitiesPanel } from './ComputerCapabilitiesPanel';

describe('ComputerCapabilitiesPanel', () => {
  it('renders Your computer heading and limitations notice by default', () => {
    const html = renderToStaticMarkup(
      React.createElement(ComputerCapabilitiesPanel, {
        mode: 'slideshow',
        durationSeconds: 30,
        showLimitations: true,
      })
    );

    expect(html).toContain('Your computer');
    expect(html).toContain('Limitations:');
    expect(html).toContain(
      'visuals are generated scenes with camera moves, not real motion video; CPU generation is slow; first run needs one-time model downloads.'
    );
  });

  it('hides limitations notice when showLimitations is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(ComputerCapabilitiesPanel, {
        mode: 'slideshow',
        showLimitations: false,
      })
    );

    expect(html).toContain('Your computer');
    expect(html).not.toContain(
      'visuals are generated scenes with camera moves, not real motion video'
    );
  });
});

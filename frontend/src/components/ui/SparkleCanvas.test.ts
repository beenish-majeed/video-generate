import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SparkleCanvas } from './SparkleCanvas';

describe('SparkleCanvas Component', () => {
  it('renders canvas element with fixed full-viewport styling and accessibility attributes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SparkleCanvas, { density: 'full' })
    );

    expect(markup).toContain('sparkle-canvas-layer');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-testid="sparkle-canvas"');
    expect(markup).toContain('position:fixed');
  });

  it('renders correctly with subtle density mode', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SparkleCanvas, { density: 'subtle' })
    );

    expect(markup).toContain('sparkle-canvas-layer');
  });
});

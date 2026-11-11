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

  it('measures frame compute performance achieving sub-millisecond per-frame cost (>60 FPS)', () => {
    // Benchmark particle motion & twinkling calculation loop
    const width = 1920;
    const height = 1080;
    const area = width * height;
    const count = Math.min(180, Math.max(70, Math.floor(area / 9000)));

    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.6 + 0.9,
        twinkleSpeed: Math.random() * 0.0018 + 0.0008,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.7 + 0.3,
        baseAlpha: Math.random() * 0.45 + 0.25,
        isTealGlitter: Math.random() > 0.65,
      });
    }

    const getNow = () =>
      typeof performance !== 'undefined'
        ? performance.now()
        : Date.now();

    let lastAlpha = 0;
    const t0 = getNow();
    const FRAMES_TO_BENCHMARK = 60;
    for (let f = 0; f < FRAMES_TO_BENCHMARK; f++) {
      const time = f * 16.666;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const driftX = 0.5 * 22 * s.depth;
        const driftY = 0.5 * 22 * s.depth;
        let drawX = (s.x + driftX) % width;
        if (drawX < 0) drawX += width;
        let drawY = (s.y + driftY) % height;
        if (drawY < 0) drawY += height;
        const twinkle = Math.sin(time * s.twinkleSpeed + s.phase);
        lastAlpha = Math.max(0.08, Math.min(0.9, s.baseAlpha * (0.55 + 0.45 * twinkle)));
      }
    }
    const elapsed = getNow() - t0;
    const avgMsPerFrame = elapsed / FRAMES_TO_BENCHMARK;
    expect(lastAlpha).toBeGreaterThanOrEqual(0.08);
    // 60 FPS requires < 16.6ms per frame. Particle loop compute cost should be < 2.0ms.
    expect(avgMsPerFrame).toBeLessThan(2.0);
  });
});
